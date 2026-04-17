import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, ChevronLeft, ChevronRight, Download, CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp, SkipForward, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConversationData {
  [key: string]: string;
}

const CASE_TYPES = [
  'Account',
  'Account Closures',
  'Account Management',
  'Cancelled Chat',
  'Casino',
  'Casino Credit',
  'Casino Errors',
  'Casino Payout',
  'Casino Promotions',
  'Compliance Alert',
  'Deposit',
  'Eligibility',
  'FanCash',
  'FanaticsOne',
  'Fraud',
  'Fraud Alert',
  'Free-to-Play Games',
  'Gaming Limits',
  'GeoLocation',
  'KYC',
  'Markets',
  'Merge',
  'Other',
  'Promotions',
  'Refer A Friend',
  'Regulatory Operations',
  'Responsible Gaming',
  'Retail',
  'Routing',
  'Tax / Taxes',
  'Technical Support',
  'VIP',
  'Withdrawal',
];

export default function App() {
  const [csvData, setCsvData] = useState<ConversationData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewerName, setReviewerName] = useState('');
  const [reviews, setReviews] = useState<Map<number, { status: 'good' | 'bad' | null; reason: string; reviewer: string }>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [caseType, setCaseType] = useState('Account');
  const [daysBack, setDaysBack] = useState(30);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [customerInfoCollapsed, setCustomerInfoCollapsed] = useState(false);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [reviewFlash, setReviewFlash] = useState<'good' | 'bad' | null>(null);
  const [showKeyboardHints, setShowKeyboardHints] = useState(true);

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('conversationReviewSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (session.reviewerName) setReviewerName(session.reviewerName);
        if (session.currentIndex !== undefined) setCurrentIndex(session.currentIndex);
        if (session.reviews) {
          const reviewMap = new Map(Object.entries(session.reviews).map(([key, value]) => [Number(key), value as { status: 'good' | 'bad' | null; reason: string; reviewer: string }]));
          setReviews(reviewMap);
        }
        setSessionLoaded(true);
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    }
  }, []);

  // Save session to localStorage whenever reviews, currentIndex, or reviewerName changes
  useEffect(() => {
    if (csvData.length > 0) {
      const session = {
        reviewerName,
        currentIndex,
        reviews: Object.fromEntries(reviews),
        lastSaved: new Date().toISOString(),
      };
      localStorage.setItem('conversationReviewSession', JSON.stringify(session));

      // Show save indicator
      setShowSaveIndicator(true);
      setTimeout(() => setShowSaveIndicator(false), 1500);
    }
  }, [reviews, currentIndex, reviewerName, csvData.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (!reviewerName || csvData.length === 0) return;

      // Don't trigger if typing in textarea or input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case '1':
          e.preventDefault();
          updateReview('good', '');
          break;
        case '2':
          e.preventDefault();
          updateReview('bad', currentReview.reason);
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          goToNextUnreviewed();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [csvData, currentIndex, reviewerName, reviews]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        setCsvData(results.data as ConversationData[]);
        if (results.data.length > 0) {
          setHeaders(Object.keys(results.data[0] as ConversationData));
        }
        setCurrentIndex(0);
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
      },
    });
  };

  const currentRecord = csvData[currentIndex];
  const currentReview = reviews.get(currentIndex) || { status: null, reason: '', reviewer: '' };

  const updateReview = (status: 'good' | 'bad' | null, reason: string = '', skipFlash: boolean = false) => {
    const newReviews = new Map(reviews);
    newReviews.set(currentIndex, { status, reason, reviewer: reviewerName });
    setReviews(newReviews);

    // Visual feedback - only flash if status changed and not explicitly skipped
    if (!skipFlash && currentReview.status !== status) {
      setReviewFlash(status);
      setTimeout(() => setReviewFlash(null), 300);
    }
  };

  const clearSession = () => {
    if (confirm('Are you sure you want to clear all reviews and start over? This cannot be undone.')) {
      localStorage.removeItem('conversationReviewSession');
      setReviews(new Map());
      setCurrentIndex(0);
      setReviewerName('');
    }
  };

  const exportCSV = () => {
    const enrichedData = csvData.map((row, index) => {
      const review = reviews.get(index);
      return {
        ...row,
        review_status: review?.status || '',
        review_reason: review?.reason || '',
        reviewer_name: review?.reviewer || reviewerName,
        review_timestamp: review ? new Date().toISOString() : '',
      };
    });

    const csv = Papa.unparse(enrichedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    a.download = `reviewed_conversations_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const goToNext = () => {
    if (currentIndex < csvData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNextUnreviewed = () => {
    for (let i = currentIndex + 1; i < csvData.length; i++) {
      const review = reviews.get(i);
      if (!review || review.status === null) {
        setCurrentIndex(i);
        return;
      }
    }
    // If no unreviewed found after current, search from beginning
    for (let i = 0; i < currentIndex; i++) {
      const review = reviews.get(i);
      if (!review || review.status === null) {
        setCurrentIndex(i);
        return;
      }
    }
  };

  const reviewedCount = Array.from(reviews.values()).filter(r => r.status !== null).length;
  const unreviewedCount = csvData.length - reviewedCount;
  const progressPercent = csvData.length > 0 ? (reviewedCount / csvData.length) * 100 : 0;

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return dateStr.split('T')[0];
    } catch {
      return dateStr;
    }
  };

  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '');

  const getRecordValue = (record: ConversationData | undefined, possibleKeys: string[]) => {
    if (!record) return '';

    const entries = Object.entries(record);

    for (const key of possibleKeys) {
      const directValue = record[key];
      if (directValue !== undefined && directValue !== null && String(directValue).trim() !== '') {
        return String(directValue).trim();
      }

      const normalizedKey = normalizeKey(key);
      const matchedEntry = entries.find(([entryKey, entryValue]) => (
        normalizeKey(entryKey) === normalizedKey &&
        entryValue !== undefined &&
        entryValue !== null &&
        String(entryValue).trim() !== ''
      ));

      if (matchedEntry) {
        return String(matchedEntry[1]).trim();
      }
    }

    return '';
  };

  const getCSATColor = (score: string) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore)) return 'text-zinc-400';
    if (numScore >= 4) return 'text-green-500';
    if (numScore >= 3) return 'text-yellow-500';
    return 'text-red-500';
  };

  const parseTranscript = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      const isAgent = /^(agent|live agent|representative|support):/i.test(line.trim());
      const isCustomer = /^(customer|user|visitor):/i.test(line.trim());
      const isBot = /^(bot|chatbot|ai):/i.test(line.trim());

      let speaker = '';
      let message = line;

      if (isAgent) {
        speaker = 'Agent';
        message = line.replace(/^(agent|live agent|representative|support):\s*/i, '');
      } else if (isCustomer) {
        speaker = 'Customer';
        message = line.replace(/^(customer|user|visitor):\s*/i, '');
      } else if (isBot) {
        speaker = 'Bot';
        message = line.replace(/^(bot|chatbot|ai):\s*/i, '');
      }

      return { speaker, message, original: line };
    });
  };

  const caseNumber = getRecordValue(currentRecord, ['case_number', 'case number', 'case_id', 'case id']);
  const selectedCaseType = getRecordValue(currentRecord, ['case_type', 'case type']);
  const productFlag = getRecordValue(currentRecord, ['product_flag', 'product flag', 'product_preference', 'product preference']);
  const liveAgentValue = getRecordValue(currentRecord, ['went_to_live_agent', 'went to live agent', 'live_agent', 'live agent']);
  const agentTranscript = getRecordValue(currentRecord, ['chat_agent_transcript', 'chat agent transcript', 'agent_transcript', 'agent transcript']);
  const wentToLiveAgent = liveAgentValue || (agentTranscript ? 'Yes' : 'No');
  const csatScore = getRecordValue(currentRecord, ['csat_score', 'csat score']);
  const agentName = getRecordValue(currentRecord, ['agent_name', 'agent name']);
  const caseCreated = getRecordValue(currentRecord, ['case_created_est', 'case created est', 'case_created', 'case created', 'created_at', 'created at']);

  const generateSQL = () => {
    const sql = `SELECT
    case_number,
    case_id,
    account_id,
    agent_name,
    agent_email,
    agent_company,
    case_source,
    case_status,
    case_type,
    case_subtype,
    channel_name,
    origin,
    product_flag,
    product_preference,
    current_value_band,
    current_casino_segment,
    current_state,
    registration_state,
    lifecycle,
    is_closed,
    is_escalated,
    is_contained,
    is_any_vip,
    is_ai_agent,
    csat_score,
    case_time_minutes,
    case_closed_count,
    kyc_decision,
    case_created_est,
    case_closed_est,
    last_modified_est,
    CASE
        WHEN chat_agent_transcript IS NOT NULL AND chat_agent_transcript != ''
        THEN 'Yes'
        ELSE 'No'
    END AS went_to_live_agent,
    chat_full_transcript,
    chat_agent_transcript,
    chat_customer_transcript,
    chat_bot_transcript,
    customer_comments
FROM FBG_ANALYTICS.OPERATIONS.CS_CASES
WHERE chat_full_transcript IS NOT NULL
  AND case_type ILIKE '${caseType}'
  AND case_source = 'Inbound: ChatBot'
  AND case_created_est >= DATEADD(DAY, -${daysBack}, CURRENT_DATE)
ORDER BY case_created_est DESC
LIMIT 50;`;

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'get_transcripts.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-zinc-800 bg-[#0f0f0f] sticky top-0 z-50">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl tracking-tight text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Conversation Review
              </h1>
              <p className="mt-1 text-sm text-zinc-400">Quality assurance tool</p>
            </div>

            <div className="flex items-center gap-4">
              {showSaveIndicator && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-green-500 text-sm"
                >
                  <Check size={16} />
                  Saved
                </motion.div>
              )}

              <div className="flex flex-col items-end">
                <label className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Reviewer</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="Enter your name"
                  className="px-4 py-2 border-2 border-zinc-700 bg-[#0a0a0a] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20 transition-colors"
                />
              </div>

              {csvData.length > 0 && (
                <>
                  <button
                    onClick={clearSession}
                    className="flex items-center gap-2 px-4 py-3 border-2 border-zinc-700 text-white hover:bg-zinc-900 transition-colors"
                    title="Clear all reviews and start over"
                  >
                    <RotateCcw size={18} />
                    Clear Session
                  </button>
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                  >
                    <Download size={18} />
                    Export Results
                  </button>
                </>
              )}
            </div>
          </div>

          {csvData.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-white">
                    Reviewed: <span className="font-semibold text-green-500">{reviewedCount}</span> of {csvData.length}
                  </span>
                  <span className="text-sm text-zinc-400">
                    Unreviewed: <span className="font-semibold text-red-500">{unreviewedCount}</span>
                  </span>
                </div>
                <span className="text-sm font-semibold text-white">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 bg-zinc-900 relative overflow-hidden rounded-full">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-600 to-red-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
                {/* Mini progress dots */}
                <div className="absolute inset-0 flex">
                  {csvData.map((_, index) => {
                    const review = reviews.get(index);
                    const width = `${100 / csvData.length}%`;
                    return (
                      <div
                        key={index}
                        style={{ width }}
                        className={`border-r border-[#0a0a0a] ${
                          review?.status === 'good' ? 'bg-green-600/40' :
                          review?.status === 'bad' ? 'bg-red-600/40' :
                          'bg-transparent'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Keyboard Hints Overlay */}
      {csvData.length > 0 && showKeyboardHints && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-8 z-[100] bg-zinc-900 border border-zinc-700 px-4 py-3 rounded-lg shadow-xl"
        >
          <button
            onClick={() => setShowKeyboardHints(false)}
            className="absolute -top-2 -right-2 bg-zinc-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-zinc-700"
          >
            ×
          </button>
          <p className="text-xs font-semibold text-zinc-300 mb-2">Keyboard Shortcuts</p>
          <div className="space-y-1 text-xs text-zinc-400">
            <div className="flex justify-between gap-4">
              <span>← →</span>
              <span>Navigate</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>1</span>
              <span>Mark Good</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>2</span>
              <span>Mark Bad</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>N</span>
              <span>Next Unreviewed</span>
            </div>
          </div>
        </motion.div>
      )}

      {csvData.length === 0 ? (
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-8">
          <div className="max-w-2xl">
            <div className="border-2 border-zinc-800 bg-[#0f0f0f] p-8 rounded-lg">
              <h2 className="text-2xl text-white mb-6" style={{ fontFamily: "'DM Serif Display', serif" }}>
                How to Use
              </h2>

              <div className="space-y-4 text-zinc-300">
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">1</span>
                  <div className="flex-1">
                    <p className="font-medium text-white mb-3">Generate SQL Query</p>
                    <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-4 rounded">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs uppercase tracking-wider text-zinc-400 mb-2 block">Case Type</label>
                          <select
                            value={caseType}
                            onChange={(e) => setCaseType(e.target.value)}
                            className="w-full px-3 py-2 border border-zinc-700 bg-[#0a0a0a] text-white text-sm focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
                          >
                            {CASE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wider text-zinc-400 mb-2 block">Days Back</label>
                          <input
                            type="number"
                            value={daysBack}
                            onChange={(e) => setDaysBack(Number(e.target.value))}
                            min="1"
                            max="365"
                            className="w-full px-3 py-2 border border-zinc-700 bg-[#0a0a0a] text-white text-sm focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
                          />
                        </div>
                      </div>
                      <button
                        onClick={generateSQL}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm hover:bg-red-700 transition-colors rounded"
                      >
                        <Download size={16} />
                        Download SQL Query
                      </button>
                      <p className="text-xs text-zinc-400">
                        Run this query in Snowflake and export the results as CSV.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">2</span>
                  <div>
                    <p className="font-medium text-white">Run Query in Snowflake</p>
                    <p className="text-sm text-zinc-400 mt-1">Open Snowflake, run the downloaded SQL query, and export the results as a CSV file.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">3</span>
                  <div>
                    <p className="font-medium text-white">Upload Your CSV</p>
                    <p className="text-sm text-zinc-400 mt-1">Click below to select the CSV file you exported from Snowflake.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">4</span>
                  <div>
                    <p className="font-medium text-white">Enter Your Name</p>
                    <p className="text-sm text-zinc-400 mt-1">Add your name as the reviewer in the header section.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">5</span>
                  <div>
                    <p className="font-medium text-white">Review Conversations</p>
                    <p className="text-sm text-zinc-400 mt-1">Read each conversation transcript and customer details. Mark as "Good" or "Bad" quality.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">6</span>
                  <div>
                    <p className="font-medium text-white">Add Notes (Optional)</p>
                    <p className="text-sm text-zinc-400 mt-1">If marking as "Bad", provide a reason explaining the quality issue.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-semibold">7</span>
                  <div>
                    <p className="font-medium text-white">Navigate & Export</p>
                    <p className="text-sm text-zinc-400 mt-1">Use keyboard shortcuts or buttons to navigate. Click "Export Results" when done.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-8">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group relative px-12 py-6 border-4 border-dashed border-zinc-800 hover:border-red-600 transition-all bg-[#0f0f0f] rounded-lg"
              >
                <Upload size={48} className="mx-auto mb-4 text-zinc-600 group-hover:text-red-600 transition-colors" />
                <p className="text-xl text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  Upload CSV File
                </p>
                <p className="text-sm text-zinc-400 mt-2">Click to select a file</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="p-8"
          >
            <div className="max-w-[1800px] mx-auto mb-6">
              {/* Case Summary Bar */}
              <div className="bg-[#0f0f0f] border border-zinc-800 p-6 rounded-lg">
                <div className="grid grid-cols-5 gap-6">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Case Number</dt>
                    <dd className="text-xl font-semibold text-white">{caseNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Case Type</dt>
                    <dd className="text-xl font-semibold text-white">{selectedCaseType || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Product Flag</dt>
                    <dd className="text-xl font-semibold text-white">{productFlag || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Went to Live Agent</dt>
                    <dd className="text-xl font-semibold">
                      {/^(yes|true|1)$/i.test(wentToLiveAgent) ? (
                        <span className="inline-flex items-center px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded-full text-sm">
                          Yes
                        </span>
                      ) : (
                        <span className="text-zinc-400">No</span>
                      )}
                    </dd>
                  </div>
                  {csatScore && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">CSAT Score</dt>
                      <dd className={`text-xl font-semibold ${getCSATColor(csatScore)}`}>
                        {csatScore}
                      </dd>
                    </div>
                  )}
                  {agentName && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Agent</dt>
                      <dd className="text-sm font-medium text-white truncate">{agentName}</dd>
                    </div>
                  )}
                  {caseCreated && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Created</dt>
                      <dd className="text-sm font-medium text-zinc-300">{formatRelativeTime(caseCreated)}</dd>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`grid gap-6 max-w-[1800px] mx-auto transition-all duration-300 ${
              customerInfoCollapsed ? 'grid-cols-12' : 'grid-cols-12'
            }`}>
              {/* Customer Info */}
              <div className={customerInfoCollapsed ? 'col-span-1' : 'col-span-2'}>
                <div className="bg-[#0f0f0f] border border-zinc-800 sticky top-24 max-h-[calc(100vh-200px)] flex flex-col rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <h2 className={`text-lg text-white ${customerInfoCollapsed ? 'hidden' : ''}`} style={{ fontFamily: "'DM Serif Display', serif" }}>
                      Customer Info
                    </h2>
                    <button
                      onClick={() => setCustomerInfoCollapsed(!customerInfoCollapsed)}
                      className="text-zinc-400 hover:text-white transition-colors p-1"
                      title={customerInfoCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {customerInfoCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                  </div>
                  {!customerInfoCollapsed && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {Object.entries(currentRecord)
                        .filter(([key]) =>
                          !key.toLowerCase().includes('transcript') &&
                          !key.toLowerCase().includes('chat') &&
                          !key.toLowerCase().includes('conversation') &&
                          !key.toLowerCase().includes('message') &&
                          !key.toLowerCase().includes('review_status') &&
                          !key.toLowerCase().includes('review_reason') &&
                          !key.toLowerCase().includes('reviewer_name') &&
                          !key.toLowerCase().includes('comments')
                        )
                        .map(([key, value]) => (
                          <div key={key} className="pb-2 border-b border-zinc-800 last:border-0">
                            <dt className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{key.replace(/_/g, ' ')}</dt>
                            <dd className="text-sm font-medium break-words text-zinc-200">{value || '—'}</dd>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript */}
              <div className={customerInfoCollapsed ? 'col-span-8' : 'col-span-7'}>
                <motion.div
                  animate={reviewFlash ? {
                    backgroundColor: reviewFlash === 'good' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                  } : {
                    backgroundColor: 'rgba(15, 15, 15, 1)'
                  }}
                  transition={{ duration: 0.3 }}
                  className="border border-zinc-800 h-[calc(100vh-200px)] flex flex-col rounded-lg overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h2 className="text-lg text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      Conversation Transcript
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6" style={{ lineHeight: '1.8' }}>
                    {Object.entries(currentRecord)
                      .filter(([key]) => key.toLowerCase().includes('transcript') || key.toLowerCase().includes('chat'))
                      .map(([key, value]) => {
                        const parsedMessages = parseTranscript(value);

                        return (
                          <div key={key} className="space-y-4">
                            {parsedMessages.map((msg, index) => (
                              <div key={index} className="leading-loose">
                                {msg.speaker && (
                                  <span className={`text-xs uppercase tracking-wider font-semibold mr-2 ${
                                    msg.speaker === 'Agent' ? 'text-blue-400' :
                                    msg.speaker === 'Customer' ? 'text-green-400' :
                                    'text-purple-400'
                                  }`}>
                                    {msg.speaker}:
                                  </span>
                                )}
                                <span className="text-zinc-100 text-base">
                                  {msg.message || msg.original}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}

                    {!Object.keys(currentRecord).some(key =>
                      key.toLowerCase().includes('transcript') || key.toLowerCase().includes('chat')
                    ) && (
                      <div className="space-y-2">
                        {Object.entries(currentRecord).map(([key, value]) => (
                          <div key={key} className="pb-2 border-b border-zinc-800 last:border-0">
                            <dt className="text-xs uppercase tracking-wider text-zinc-400 mb-1">{key}</dt>
                            <dd className="text-sm text-white">{value}</dd>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Review Panel */}
              <div className="col-span-3">
                <div className="bg-[#0f0f0f] border border-zinc-800 p-6 sticky top-24 rounded-lg">
                  <h2 className="text-lg mb-6 pb-3 border-b border-zinc-800 text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    Review
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-zinc-400 mb-3">Quality Assessment</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => updateReview('good', '')}
                          className={`flex-1 py-3 px-4 border-2 transition-all flex items-center justify-center gap-2 rounded ${
                            currentReview.status === 'good'
                              ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-600/20'
                              : 'border-zinc-700 text-white hover:border-green-600 hover:bg-zinc-900'
                          }`}
                        >
                          <CheckCircle2 size={20} />
                          Good
                        </button>
                        <button
                          onClick={() => updateReview('bad', currentReview.reason)}
                          className={`flex-1 py-3 px-4 border-2 transition-all flex items-center justify-center gap-2 rounded ${
                            currentReview.status === 'bad'
                              ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20'
                              : 'border-zinc-700 text-white hover:border-red-600 hover:bg-zinc-900'
                          }`}
                        >
                          <XCircle size={20} />
                          Bad
                        </button>
                      </div>
                    </div>

                    {currentReview.status === 'bad' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <label className="text-xs uppercase tracking-wider text-zinc-400 mb-2 block">
                          Reason for poor quality
                        </label>
                        <textarea
                          value={currentReview.reason}
                          onChange={(e) => updateReview('bad', e.target.value, true)}
                          placeholder="Describe the issue..."
                          rows={4}
                          className="w-full px-4 py-3 border border-zinc-700 bg-[#0a0a0a] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20 resize-none rounded"
                        />
                      </motion.div>
                    )}

                    <div className="pt-4 border-t border-zinc-800">
                      {!reviewerName && (
                        <p className="text-center text-sm text-red-500 mb-3">
                          Please enter your reviewer name in the header to navigate
                        </p>
                      )}

                      <button
                        onClick={goToNextUnreviewed}
                        disabled={!reviewerName || unreviewedCount === 0}
                        className="w-full mb-3 py-2 px-4 border border-zinc-700 text-white hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center gap-2 rounded text-sm"
                        title="Jump to next unreviewed record"
                      >
                        <SkipForward size={16} />
                        Next Unreviewed
                      </button>

                      <div className="flex gap-3">
                        <button
                          onClick={goToPrevious}
                          disabled={currentIndex === 0 || !reviewerName}
                          className="flex-1 py-3 px-4 border-2 border-zinc-700 text-white hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center gap-2 rounded"
                          title={!reviewerName ? 'Enter reviewer name to navigate' : ''}
                        >
                          <ChevronLeft size={20} />
                          Previous
                        </button>
                        <button
                          onClick={goToNext}
                          disabled={currentIndex === csvData.length - 1 || !reviewerName}
                          className="flex-1 py-3 px-4 bg-red-600 text-white hover:bg-red-700 disabled:opacity-30 disabled:hover:bg-red-600 transition-colors flex items-center justify-center gap-2 rounded shadow-lg shadow-red-600/20"
                          title={!reviewerName ? 'Enter reviewer name to navigate' : ''}
                        >
                          Next
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <p className="text-center text-sm text-zinc-400 mt-3">
                        Record {currentIndex + 1} of {csvData.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
