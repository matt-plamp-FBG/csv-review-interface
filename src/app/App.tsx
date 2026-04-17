import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckCircle2,
  XCircle,
  RotateCcw,
  SkipForward,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConversationData {
  [key: string]: string;
}

interface ReviewData {
  status: 'good' | 'bad' | null;
  reason: string;
  reviewer: string;
}

interface SavedSession {
  reviewerName?: string;
  currentIndex?: number;
  reviews?: Record<string, ReviewData>;
  datasetKey?: string;
}

interface TranscriptMessage {
  speaker: string;
  message: string;
  original: string;
  timestamp: string;
}

const REVIEW_STORAGE_KEY = 'conversationReviewSession';
const DEFAULT_SQL_FILENAME = 'betting_ai_agent_cases.sql';
const DEFAULT_CASE_TYPE = 'Betting';
const DEFAULT_START_DATE = '2026-04-15';
const DEFAULT_END_DATE = '2026-04-16';
const DEFAULT_ROW_LIMIT = 50;
const TIMESTAMPED_TRANSCRIPT_PATTERN =
  /\[(?<timestamp>[^\]]+)\]\s*(?<speaker>Customer|Bot|Chatbot|AI|Agent|Live Agent|Representative|Support)\s*:\s*(?<message>[\s\S]*?)(?=\s*\[[^\]]+\]\s*(?:Customer|Bot|Chatbot|AI|Agent|Live Agent|Representative|Support)\s*:|$)/gi;

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '');

const hasText = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== '';

const escapeSqlString = (value: string) => value.replace(/'/g, "''").trim();

const buildSqlQuery = ({
  caseType,
  startDate,
  endDate,
  rowLimit,
}: {
  caseType: string;
  startDate: string;
  endDate: string;
  rowLimit: string;
}) => {
  const sanitizedCaseType = escapeSqlString(caseType || DEFAULT_CASE_TYPE);
  const sanitizedStartDate = startDate || DEFAULT_START_DATE;
  const sanitizedEndDate = endDate || DEFAULT_END_DATE;
  const parsedRowLimit = Number.parseInt(rowLimit, 10);
  const sanitizedRowLimit = Number.isFinite(parsedRowLimit) && parsedRowLimit > 0
    ? parsedRowLimit
    : DEFAULT_ROW_LIMIT;

  return `select c.case_number,* 
from fbg_analytics.operations.chatbot_cases B
join fbg_analytics.operations.cs_cases C on B.case_id=C.case_id
where B.is_ai_agent = 'True'
and date (B.case_created_est) BETWEEN '${sanitizedStartDate}' AND '${sanitizedEndDate}'
and B.case_type in ('${sanitizedCaseType}')
order by B.case_created_est desc
limit ${sanitizedRowLimit}`;
};

const buildDatasetKey = (rows: ConversationData[]) =>
  rows
    .map((row, index) => {
      const transcript =
        row.chat_full_transcript_w_ts ||
        row.chat_full_transcript ||
        row.chat_agent_transcript ||
        '';
      return [
        row.case_number || `row-${index}`,
        row.case_id || '',
        row.case_created_est || '',
        transcript.slice(0, 64),
      ].join('|');
    })
    .join('~');

const normalizeRecord = (record: ConversationData): ConversationData => {
  const entries = Object.entries(record).map(([key, value]) => [key.trim(), String(value ?? '').trim()] as const);
  const normalized: ConversationData = {};

  const findValue = (possibleKeys: string[]) => {
    for (const key of possibleKeys) {
      const exactMatch = entries.find(([entryKey, entryValue]) => entryKey === key && hasText(entryValue));
      if (exactMatch) {
        return exactMatch[1];
      }

      const normalizedKey = normalizeKey(key);
      const normalizedMatch = entries.find(([entryKey, entryValue]) => (
        normalizeKey(entryKey) === normalizedKey &&
        hasText(entryValue)
      ));

      if (normalizedMatch) {
        return normalizedMatch[1];
      }
    }

    return '';
  };

  const assign = (key: string, value: string) => {
    if (hasText(value)) {
      normalized[key] = value;
    }
  };

  const dateHeaderValue = entries.find(([key, value]) => (
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(key) && hasText(value)
  ))?.[1] ?? '';

  assign('case_number', findValue(['case_number', 'case number', 'CASE_NUMBER']));
  assign('case_id', findValue(['case_id', 'case id', '_1']));
  assign('user_account', findValue(['user_account', 'user account', 'account_id', 'account id']));
  assign('current_value_band', findValue(['current_value_band', 'current value band']));
  assign('case_created_est', findValue([
    'case_created_est',
    'case created est',
    'case_created',
    'case created',
    'created_at',
    'created at',
  ]) || dateHeaderValue);
  assign('origin', findValue(['origin']));
  assign('case_type', findValue(['case_type', 'case type']));
  assign('case_subtype', findValue(['case_subtype', 'case subtype']));
  assign('chat_full_transcript_w_ts', findValue([
    'chat_full_transcript_w_ts',
    'chat full transcript w ts',
    'chat_full_transcript',
    'chat full transcript',
  ]));
  assign('chat_agent_transcript', findValue(['chat_agent_transcript', 'chat agent transcript']));
  assign('chat_customer_transcript', findValue(['chat_customer_transcript', 'chat customer transcript']));
  assign('chat_bot_transcript', findValue(['chat_bot_transcript', 'chat bot transcript']));
  assign('agent_name', findValue(['agent_name', 'agent name']));
  assign('product_flag', findValue(['product_flag', 'product flag', 'product_preference', 'product preference']));
  assign('csat_score', findValue(['csat_score', 'csat score']));
  assign('sme_feedback', findValue(['SME Feedback', 'sme_feedback', 'sme feedback']));
  assign('reviewed_by', findValue(['Reviewed By', 'reviewed_by', 'reviewed by']));

  const handledKeys = new Set([
    '',
    '_1',
    'case_number',
    'case number',
    'CASE_NUMBER',
    'case_id',
    'case id',
    'user_account',
    'user account',
    'account_id',
    'account id',
    'current_value_band',
    'current value band',
    'case_created_est',
    'case created est',
    'case_created',
    'case created',
    'created_at',
    'created at',
    'origin',
    'case_type',
    'case type',
    'case_subtype',
    'case subtype',
    'chat_full_transcript_w_ts',
    'chat full transcript w ts',
    'chat_full_transcript',
    'chat full transcript',
    'chat_agent_transcript',
    'chat agent transcript',
    'chat_customer_transcript',
    'chat customer transcript',
    'chat_bot_transcript',
    'chat bot transcript',
    'agent_name',
    'agent name',
    'product_flag',
    'product flag',
    'product_preference',
    'product preference',
    'csat_score',
    'csat score',
    'SME Feedback',
    'sme_feedback',
    'sme feedback',
    'Reviewed By',
    'reviewed_by',
    'reviewed by',
  ].map(normalizeKey));

  for (const [key, value] of entries) {
    if (!hasText(value) || handledKeys.has(normalizeKey(key)) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(key)) {
      continue;
    }

    const safeKey = key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!safeKey || safeKey in normalized) {
      continue;
    }

    normalized[safeKey] = value;
  }

  return normalized;
};

const parseCsvText = (csvText: string) => {
  const results = Papa.parse<ConversationData>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  return results.data
    .map(normalizeRecord)
    .filter((row) => Object.values(row).some((value) => hasText(value)));
};

const normalizeSpeaker = (speaker: string) => {
  if (/customer|user|visitor/i.test(speaker)) {
    return 'Customer';
  }

  if (/bot|chatbot|ai/i.test(speaker)) {
    return 'Bot';
  }

  return 'Agent';
};

const getSpeakerPresentation = (speaker: string) => {
  if (speaker === 'Customer') {
    return {
      alignment: 'justify-end',
      stackAlignment: 'items-end',
      bubbleClassName:
        'bg-emerald-950/95 text-zinc-50 border border-emerald-700/70 rounded-[22px] rounded-br-md shadow-[0_18px_34px_-24px_rgba(16,185,129,0.65)]',
      metaClassName: 'text-zinc-400',
      labelClassName: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      avatarClassName: 'border border-emerald-500/35 bg-zinc-900 text-emerald-200',
      label: 'Customer',
      avatarText: 'C',
    };
  }

  if (speaker === 'Bot') {
    return {
      alignment: 'justify-start',
      stackAlignment: 'items-start',
      bubbleClassName:
        'bg-zinc-900/95 text-zinc-50 border border-amber-500/30 rounded-[22px] rounded-bl-md shadow-[0_18px_34px_-24px_rgba(245,158,11,0.45)]',
      metaClassName: 'text-zinc-400',
      labelClassName: 'border border-amber-500/25 bg-amber-500/10 text-amber-200',
      avatarClassName: 'border border-amber-500/35 bg-zinc-900 text-amber-200',
      label: 'Bot',
      avatarText: 'B',
    };
  }

  if (speaker === 'Agent') {
    return {
      alignment: 'justify-start',
      stackAlignment: 'items-start',
      bubbleClassName:
        'bg-zinc-900/95 text-zinc-50 border border-sky-500/30 rounded-[22px] rounded-bl-md shadow-[0_18px_34px_-24px_rgba(14,165,233,0.45)]',
      metaClassName: 'text-zinc-400',
      labelClassName: 'border border-sky-500/25 bg-sky-500/10 text-sky-200',
      avatarClassName: 'border border-sky-500/35 bg-zinc-900 text-sky-200',
      label: 'Agent',
      avatarText: 'A',
    };
  }

  return {
    alignment: 'justify-start',
    stackAlignment: 'items-start',
    bubbleClassName:
      'bg-zinc-900/95 text-zinc-50 border border-zinc-700 rounded-[22px] rounded-bl-md shadow-[0_16px_28px_-20px_rgba(0,0,0,0.85)]',
    metaClassName: 'text-zinc-400',
    labelClassName: 'border border-zinc-700 bg-zinc-800 text-zinc-200',
    avatarClassName: 'border border-zinc-600 bg-zinc-900 text-zinc-200',
    label: speaker || 'Message',
    avatarText: (speaker || 'M').slice(0, 1).toUpperCase(),
  };
};

const formatMessageTimestamp = (timestamp: string) => {
  if (!timestamp) {
    return '';
  }

  const normalizedTimestamp = timestamp.includes('T')
    ? timestamp
    : timestamp.replace(' ', 'T');
  const parsedDate = new Date(normalizedTimestamp);

  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  return parsedDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getRecordValue = (record: ConversationData | undefined, possibleKeys: string[]) => {
  if (!record) {
    return '';
  }

  const entries = Object.entries(record);

  for (const key of possibleKeys) {
    const directValue = record[key];
    if (hasText(directValue)) {
      return String(directValue).trim();
    }

    const normalizedWanted = normalizeKey(key);
    const matchedEntry = entries.find(([entryKey, entryValue]) => (
      normalizeKey(entryKey) === normalizedWanted &&
      hasText(entryValue)
    ));

    if (matchedEntry) {
      return String(matchedEntry[1]).trim();
    }
  }

  return '';
};

const parseTranscript = (text: string) => {
  if (!hasText(text)) {
    return [] as TranscriptMessage[];
  }

  const timestampedMatches = [...text.matchAll(TIMESTAMPED_TRANSCRIPT_PATTERN)];
  if (timestampedMatches.length > 0) {
    return timestampedMatches.map((match) => ({
      speaker: normalizeSpeaker(match.groups?.speaker ?? ''),
      message: (match.groups?.message ?? '').trim(),
      original: match[0].trim(),
      timestamp: match.groups?.timestamp ?? '',
    }));
  }

  const segments = text.includes('\n')
    ? text.split('\n')
    : text.split(/(?=(?:agent|live agent|representative|support|customer|user|visitor|bot|chatbot|ai):)/i);

  return segments
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let speaker = '';
      let message = line;

      if (/^(agent|live agent|representative|support):/i.test(line)) {
        speaker = 'Agent';
        message = line.replace(/^(agent|live agent|representative|support):\s*/i, '');
      } else if (/^(customer|user|visitor):/i.test(line)) {
        speaker = 'Customer';
        message = line.replace(/^(customer|user|visitor):\s*/i, '');
      } else if (/^(bot|chatbot|ai):/i.test(line)) {
        speaker = 'Bot';
        message = line.replace(/^(bot|chatbot|ai):\s*/i, '');
      }

      return { speaker, message, original: line, timestamp: '' };
    });
};

const downloadTextFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [csvData, setCsvData] = useState<ConversationData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewerName, setReviewerName] = useState('');
  const [reviews, setReviews] = useState<Map<number, ReviewData>>(new Map());
  const [datasetKey, setDatasetKey] = useState('');
  const [datasetLabel, setDatasetLabel] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasHydratedSession, setHasHydratedSession] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [caseType, setCaseType] = useState(DEFAULT_CASE_TYPE);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [rowLimit, setRowLimit] = useState(String(DEFAULT_ROW_LIMIT));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customerInfoCollapsed, setCustomerInfoCollapsed] = useState(false);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [reviewFlash, setReviewFlash] = useState<'good' | 'bad' | null>(null);
  const [showKeyboardHints, setShowKeyboardHints] = useState(true);

  const applyLoadedData = (rows: ConversationData[], sourceLabel: string) => {
    const nextDatasetKey = buildDatasetKey(rows);
    setHasHydratedSession(false);
    setDatasetKey(nextDatasetKey);
    setDatasetLabel(sourceLabel);
    setCsvData(rows);
    setLoadError('');
    setCustomerInfoCollapsed(false);

    let nextReviewerName = reviewerName;
    let nextCurrentIndex = 0;
    let nextReviews = new Map<number, ReviewData>();

    const savedSession = localStorage.getItem(REVIEW_STORAGE_KEY);
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession) as SavedSession;
        if (!nextReviewerName && session.reviewerName) {
          nextReviewerName = session.reviewerName;
        }

        if (session.datasetKey === nextDatasetKey && session.reviews) {
          nextCurrentIndex = Math.min(
            session.currentIndex ?? 0,
            Math.max(rows.length - 1, 0),
          );
          nextReviews = new Map(
            Object.entries(session.reviews).map(([key, value]) => [Number(key), value]),
          );
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    }

    setReviewerName(nextReviewerName);
    setCurrentIndex(nextCurrentIndex);
    setReviews(nextReviews);
    setHasHydratedSession(true);
    setIsInitializing(false);
  };

  const loadCsvContent = (csvText: string, sourceLabel: string) => {
    const parsedRows = parseCsvText(csvText);
    if (parsedRows.length === 0) {
      setLoadError('No reviewable rows were found in that CSV.');
      setIsInitializing(false);
      return;
    }

    applyLoadedData(parsedRows, sourceLabel);
  };

  useEffect(() => {
    if (!hasHydratedSession || csvData.length === 0 || !datasetKey) {
      return;
    }

    const session = {
      reviewerName,
      currentIndex,
      reviews: Object.fromEntries(reviews),
      lastSaved: new Date().toISOString(),
      datasetKey,
    };

    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(session));
    setShowSaveIndicator(true);
    const timeout = window.setTimeout(() => setShowSaveIndicator(false), 1500);

    return () => window.clearTimeout(timeout);
  }, [reviews, currentIndex, reviewerName, csvData.length, datasetKey, hasHydratedSession]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!reviewerName || csvData.length === 0) {
        return;
      }

      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
        case '1':
          event.preventDefault();
          updateReview('good', '');
          break;
        case '2':
          event.preventDefault();
          updateReview('bad', currentReview.reason);
          break;
        case 'n':
        case 'N':
          event.preventDefault();
          goToNextUnreviewed();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [csvData, currentIndex, reviewerName, reviews]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsInitializing(true);
    setLoadError('');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadCsvContent(reader.result, file.name);
      }
    };
    reader.onerror = (error) => {
      console.error('CSV parsing error:', error);
      setIsInitializing(false);
      setLoadError('That CSV could not be read.');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const currentRecord = csvData[currentIndex];
  const currentReview = reviews.get(currentIndex) || { status: null, reason: '', reviewer: '' };

  const updateReview = (status: 'good' | 'bad' | null, reason: string = '', skipFlash: boolean = false) => {
    const nextReviews = new Map(reviews);
    nextReviews.set(currentIndex, { status, reason, reviewer: reviewerName });
    setReviews(nextReviews);

    if (!skipFlash && currentReview.status !== status) {
      setReviewFlash(status);
      window.setTimeout(() => setReviewFlash(null), 300);
    }
  };

  const clearSession = () => {
    if (confirm('Are you sure you want to clear all reviews and start over? This cannot be undone.')) {
      localStorage.removeItem(REVIEW_STORAGE_KEY);
      setReviews(new Map());
      setCurrentIndex(0);
      setReviewerName('');
    }
  };

  const exportCSV = () => {
    const enrichedData = csvData.map((row, index) => {
      const review = reviews.get(index);
      const reviewStatus = review?.status || '';
      const reviewReason = review?.reason || '';
      const reviewer = review?.reviewer || row.reviewed_by || reviewerName;
      const sheetFeedback = reviewStatus === 'good'
        ? 'Good'
        : reviewStatus === 'bad'
          ? reviewReason || 'Bad'
          : row.sme_feedback || '';

      return {
        ...row,
        'SME Feedback': sheetFeedback,
        'Reviewed By': reviewer,
        review_status: reviewStatus,
        review_reason: reviewReason,
        reviewer_name: reviewer,
        review_timestamp: review ? new Date().toISOString() : '',
      };
    });

    const csv = Papa.unparse(enrichedData);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadTextFile(csv, `betting_cases_sme_review_${timestamp}.csv`, 'text/csv');
  };

  const generatedSql = buildSqlQuery({
    caseType,
    startDate,
    endDate,
    rowLimit,
  });

  const downloadSQL = () => {
    downloadTextFile(generatedSql, DEFAULT_SQL_FILENAME, 'text/plain');
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
    for (let index = currentIndex + 1; index < csvData.length; index += 1) {
      const review = reviews.get(index);
      if (!review || review.status === null) {
        setCurrentIndex(index);
        return;
      }
    }

    for (let index = 0; index < currentIndex; index += 1) {
      const review = reviews.get(index);
      if (!review || review.status === null) {
        setCurrentIndex(index);
        return;
      }
    }
  };

  const reviewedCount = Array.from(reviews.values()).filter((review) => review.status !== null).length;
  const unreviewedCount = csvData.length - reviewedCount;
  const progressPercent = csvData.length > 0 ? (reviewedCount / csvData.length) * 100 : 0;

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) {
      return '—';
    }

    try {
      const normalizedDateStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
      const date = new Date(normalizedDateStr);
      if (Number.isNaN(date.getTime())) {
        return dateStr;
      }

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

  const getCSATColor = (score: string) => {
    const numericScore = parseFloat(score);
    if (Number.isNaN(numericScore)) return 'text-zinc-400';
    if (numericScore >= 4) return 'text-green-500';
    if (numericScore >= 3) return 'text-yellow-500';
    return 'text-red-500';
  };

  const caseNumber = getRecordValue(currentRecord, ['case_number', 'case number', 'case_id', 'case id']);
  const selectedCaseType = getRecordValue(currentRecord, ['case_type', 'case type']);
  const caseSubtype = getRecordValue(currentRecord, ['case_subtype', 'case subtype']);
  const currentValueBand = getRecordValue(currentRecord, ['current_value_band', 'current value band']);
  const origin = getRecordValue(currentRecord, ['origin']);
  const productFlag = getRecordValue(currentRecord, ['product_flag', 'product flag', 'product_preference', 'product preference']);
  const liveAgentValue = getRecordValue(currentRecord, ['went_to_live_agent', 'went to live agent', 'live_agent', 'live agent']);
  const agentTranscript = getRecordValue(currentRecord, ['chat_agent_transcript', 'chat agent transcript', 'agent_transcript', 'agent transcript']);
  const wentToLiveAgent = liveAgentValue || (agentTranscript ? 'Yes' : 'No');
  const csatScore = getRecordValue(currentRecord, ['csat_score', 'csat score']);
  const agentName = getRecordValue(currentRecord, ['agent_name', 'agent name']);
  const caseCreated = getRecordValue(currentRecord, ['case_created_est', 'case created est', 'case_created', 'case created', 'created_at', 'created at']);

  const summaryItems = [
    { label: 'Case Number', value: caseNumber || '—', valueClassName: 'text-xl font-semibold text-white' },
    { label: 'Case Type', value: selectedCaseType },
    { label: 'Case Subtype', value: caseSubtype },
    { label: 'Value Band', value: currentValueBand },
    { label: 'Origin', value: origin },
    { label: 'Created', value: caseCreated ? formatRelativeTime(caseCreated) : '' },
    { label: 'Product Flag', value: productFlag },
    { label: 'Went to Live Agent', value: /^(yes|true|1)$/i.test(wentToLiveAgent) ? 'Yes' : '' },
    { label: 'CSAT Score', value: csatScore, valueClassName: `text-xl font-semibold ${getCSATColor(csatScore)}` },
    { label: 'Agent', value: agentName },
  ].filter((item, index) => index === 0 || hasText(item.value));

  const transcriptEntries = Object.entries(currentRecord ?? {}).filter(([key]) => (
    key.toLowerCase().includes('transcript') || key.toLowerCase().includes('chat')
  ));

  const customerInfoEntries = Object.entries(currentRecord ?? {}).filter(([key]) => {
    const lowerKey = key.toLowerCase();
    return (
      !lowerKey.includes('transcript') &&
      !lowerKey.includes('chat') &&
      !lowerKey.includes('conversation') &&
      !lowerKey.includes('message') &&
      !lowerKey.includes('review_status') &&
      !lowerKey.includes('review_reason') &&
      !lowerKey.includes('reviewer_name') &&
      !lowerKey.includes('sme_feedback') &&
      !lowerKey.includes('reviewed_by') &&
      !lowerKey.includes('comments')
    );
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#0f0f0f]">
        <div className="px-8 py-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-4xl tracking-tight text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Conversation Review
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Configure the query, run it in Snowflake, then upload the CSV to start reviewing conversations.
              </p>
              {csvData.length > 0 && (
                <p className="mt-2 text-sm text-zinc-500">
                  Dataset: <span className="text-zinc-300">{datasetLabel}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4 xl:items-end">
              <div className="flex flex-wrap items-end gap-3 xl:justify-end">
                {showSaveIndicator && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm text-green-500"
                  >
                    <Check size={16} />
                    Saved
                  </motion.div>
                )}

                {csvData.length > 0 && (
                  <div className="flex flex-col items-start xl:items-end">
                    <label className="mb-1 text-xs uppercase tracking-wider text-zinc-400">Reviewer</label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(event) => setReviewerName(event.target.value)}
                      placeholder="Enter your name"
                      className="w-56 border-2 border-zinc-700 bg-[#0a0a0a] px-4 py-2 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                    />
                  </div>
                )}

                <button
                  onClick={downloadSQL}
                  className="flex items-center gap-2 border-2 border-zinc-700 px-4 py-3 text-white transition-colors hover:bg-zinc-900"
                >
                  <Download size={18} />
                  Download SQL
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 border-2 border-zinc-700 px-4 py-3 text-white transition-colors hover:bg-zinc-900"
                >
                  <Upload size={18} />
                  Load CSV
                </button>

                {csvData.length > 0 && (
                  <>
                    <button
                      onClick={clearSession}
                      className="flex items-center gap-2 border-2 border-zinc-700 px-4 py-3 text-white transition-colors hover:bg-zinc-900"
                      title="Clear all reviews and start over"
                    >
                      <RotateCcw size={18} />
                      Clear Session
                    </button>
                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-2 bg-red-600 px-6 py-3 text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-700"
                    >
                      <Download size={18} />
                      Export Results
                    </button>
                  </>
                )}
              </div>

              {loadError && (
                <p className="text-sm text-red-400">{loadError}</p>
              )}
            </div>
          </div>

          {csvData.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm text-white">
                    Reviewed: <span className="font-semibold text-green-500">{reviewedCount}</span> of {csvData.length}
                  </span>
                  <span className="text-sm text-zinc-400">
                    Unreviewed: <span className="font-semibold text-red-500">{unreviewedCount}</span>
                  </span>
                </div>
                <span className="text-sm font-semibold text-white">{Math.round(progressPercent)}%</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-zinc-900">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-600 to-red-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
                <div className="absolute inset-0 flex">
                  {csvData.map((_, index) => {
                    const review = reviews.get(index);
                    return (
                      <div
                        key={index}
                        style={{ width: `${100 / csvData.length}%` }}
                        className={`border-r border-[#0a0a0a] ${
                          review?.status === 'good'
                            ? 'bg-green-600/40'
                            : review?.status === 'bad'
                              ? 'bg-red-600/40'
                              : 'bg-transparent'
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

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {csvData.length > 0 && showKeyboardHints && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed right-8 top-24 z-[100] rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl"
        >
          <button
            onClick={() => setShowKeyboardHints(false)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs text-white hover:bg-zinc-700"
          >
            ×
          </button>
          <p className="mb-2 text-xs font-semibold text-zinc-300">Keyboard Shortcuts</p>
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

      {isInitializing ? (
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-8">
          <div className="rounded-lg border-2 border-zinc-800 bg-[#0f0f0f] p-8 text-center">
            <h2 className="text-2xl text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Loading CSV
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              Preparing the uploaded conversations for review.
            </p>
          </div>
        </div>
      ) : csvData.length === 0 ? (
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-8">
          <div className="w-full max-w-5xl">
            <div className="rounded-lg border-2 border-zinc-800 bg-[#0f0f0f] p-8">
              <div className="max-w-3xl">
                <h2 className="text-2xl text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  Review Setup
                </h2>
                <p className="mt-3 text-sm text-zinc-400">
                  Start here: choose the case type, date range, and row count, download the SQL, run it in Snowflake, then upload the exported CSV for review.
                </p>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">Case Type</label>
                  <input
                    type="text"
                    value={caseType}
                    onChange={(event) => setCaseType(event.target.value)}
                    placeholder="Betting"
                    className="w-full rounded border border-zinc-700 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded border border-zinc-700 bg-[#0a0a0a] px-4 py-3 text-sm text-white focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full rounded border border-zinc-700 bg-[#0a0a0a] px-4 py-3 text-sm text-white focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">Rows to Return</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={rowLimit}
                    onChange={(event) => setRowLimit(event.target.value)}
                    className="w-full rounded border border-zinc-700 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                  />
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">SQL Preview</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
                  {generatedSql}
                </pre>
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Steps</p>
                  <div className="mt-4 space-y-4 text-zinc-300">
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 font-semibold text-white">1</span>
                      <div>
                        <p className="font-medium text-white">Set the query inputs</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          Pick the case type, start date, end date, and how many rows should be returned.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 font-semibold text-white">2</span>
                      <div>
                        <p className="font-medium text-white">Download SQL and run it in Snowflake</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          The downloaded SQL uses the values above and returns AI-agent cases only.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 font-semibold text-white">3</span>
                      <div>
                        <p className="font-medium text-white">Export the Snowflake results as CSV</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          Save the query output as a CSV file, then come back here to continue.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 font-semibold text-white">4</span>
                      <div>
                        <p className="font-medium text-white">Upload the CSV and start reviewing</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          The app will normalize the transcript columns and preserve review progress for that dataset.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Actions</p>
                    <p className="mt-3 text-sm text-zinc-400">
                      Download the query first, then upload the CSV you exported from Snowflake.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <button
                      onClick={downloadSQL}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-8 py-4 text-white transition-colors hover:bg-red-700"
                    >
                      <Download size={18} />
                      Download SQL
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative rounded-lg border-2 border-dashed border-zinc-800 bg-[#0f0f0f] px-8 py-6 transition-all hover:border-red-600"
                    >
                      <Upload size={40} className="mx-auto mb-4 text-zinc-600 transition-colors group-hover:text-red-600" />
                      <p className="text-lg text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                        Upload CSV File
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">Select the CSV exported from Snowflake</p>
                    </button>
                  </div>
                </div>
              </div>
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
            <div className="mx-auto mb-6 max-w-[1800px]">
              <div className="rounded-lg border border-zinc-800 bg-[#0f0f0f] p-6">
                <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-6">
                  {summaryItems.map((item) => (
                    <div key={item.label}>
                      <dt className="mb-2 text-xs uppercase tracking-wider text-zinc-400">{item.label}</dt>
                      <dd className={item.valueClassName ?? 'text-sm font-medium text-white'}>{item.value}</dd>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mx-auto grid max-w-[1800px] grid-cols-12 gap-6">
              <div className={customerInfoCollapsed ? 'col-span-1' : 'col-span-2'}>
                <div className="sticky top-24 flex max-h-[calc(100vh-200px)] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#0f0f0f]">
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
                    <h2 className={`text-lg text-white ${customerInfoCollapsed ? 'hidden' : ''}`} style={{ fontFamily: "'DM Serif Display', serif" }}>
                      Customer Info
                    </h2>
                    <button
                      onClick={() => setCustomerInfoCollapsed(!customerInfoCollapsed)}
                      className="p-1 text-zinc-400 transition-colors hover:text-white"
                      title={customerInfoCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {customerInfoCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                  </div>
                  {!customerInfoCollapsed && (
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {customerInfoEntries.map(([key, value]) => (
                        <div key={key} className="border-b border-zinc-800 pb-2 last:border-0">
                          <dt className="mb-1 text-xs uppercase tracking-wider text-zinc-500">{key.replace(/_/g, ' ')}</dt>
                          <dd className="break-words text-sm font-medium text-zinc-200">{value || '—'}</dd>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={customerInfoCollapsed ? 'col-span-8' : 'col-span-7'}>
                <motion.div
                  animate={reviewFlash ? {
                    backgroundColor: reviewFlash === 'good' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  } : {
                    backgroundColor: 'rgba(15, 15, 15, 1)',
                  }}
                  transition={{ duration: 0.3 }}
                  className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-lg border border-zinc-800"
                >
                  <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
                    <h2 className="text-lg text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      Conversation Transcript
                    </h2>
                  </div>
                  <div
                    className="flex-1 overflow-y-auto p-6"
                    style={{
                      lineHeight: '1.75',
                      backgroundImage:
                        'linear-gradient(180deg, rgba(24,24,27,0.98), rgba(9,9,11,1))',
                    }}
                  >
                    {transcriptEntries.length > 0 ? (
                      transcriptEntries.map(([key, value]) => {
                        const parsedMessages = parseTranscript(value);

                        return (
                          <div key={key} className="space-y-4">
                            {parsedMessages.map((message, index) => {
                              const presentation = getSpeakerPresentation(message.speaker);

                              return (
                                <div
                                  key={`${key}-${index}`}
                                  className={`flex ${presentation.alignment}`}
                                >
                                  <div
                                    className={`flex max-w-[78%] gap-3 ${
                                      message.speaker === 'Customer' ? 'flex-row-reverse' : 'flex-row'
                                    }`}
                                  >
                                    <div
                                      className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] ${presentation.avatarClassName}`}
                                    >
                                      {presentation.avatarText}
                                    </div>

                                    <div className={`flex ${presentation.stackAlignment}`}>
                                      <div
                                        className={`mb-2 flex flex-wrap items-center gap-2 ${
                                          message.speaker === 'Customer' ? 'justify-end text-right' : 'justify-start text-left'
                                        }`}
                                      >
                                        <span
                                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] ${presentation.labelClassName}`}
                                        >
                                          {presentation.label}
                                        </span>
                                        {message.timestamp && (
                                          <span className={`font-mono text-[11px] ${presentation.metaClassName}`}>
                                            {formatMessageTimestamp(message.timestamp)}
                                          </span>
                                        )}
                                      </div>

                                      <div
                                        className={`px-5 py-4 text-[15px] leading-7 sm:text-[16px] ${presentation.bubbleClassName}`}
                                      >
                                        <p className="whitespace-pre-wrap break-words text-zinc-50/95">
                                          {message.message || message.original}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(currentRecord).map(([key, value]) => (
                          <div key={key} className="border-b border-zinc-800 pb-2 last:border-0">
                            <dt className="mb-1 text-xs uppercase tracking-wider text-zinc-400">{key}</dt>
                            <dd className="text-sm text-white">{value}</dd>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              <div className="col-span-3">
                <div className="sticky top-24 rounded-lg border border-zinc-800 bg-[#0f0f0f] p-6">
                  <h2 className="mb-6 border-b border-zinc-800 pb-3 text-lg text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    Review
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-3 text-xs uppercase tracking-wider text-zinc-400">Quality Assessment</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => updateReview('good', '')}
                          className={`flex flex-1 items-center justify-center gap-2 rounded border-2 px-4 py-3 transition-all ${
                            currentReview.status === 'good'
                              ? 'border-green-600 bg-green-600 text-white shadow-lg shadow-green-600/20'
                              : 'border-zinc-700 text-white hover:border-green-600 hover:bg-zinc-900'
                          }`}
                        >
                          <CheckCircle2 size={20} />
                          Good
                        </button>
                        <button
                          onClick={() => updateReview('bad', currentReview.reason)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded border-2 px-4 py-3 transition-all ${
                            currentReview.status === 'bad'
                              ? 'border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/20'
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
                        <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">
                          Reason for poor quality
                        </label>
                        <textarea
                          value={currentReview.reason}
                          onChange={(event) => updateReview('bad', event.target.value, true)}
                          placeholder="Describe the issue..."
                          rows={4}
                          className="w-full resize-none rounded border border-zinc-700 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                        />
                      </motion.div>
                    )}

                    <div className="border-t border-zinc-800 pt-4">
                      {!reviewerName && (
                        <p className="mb-3 text-center text-sm text-red-500">
                          Please enter your reviewer name in the header to navigate
                        </p>
                      )}

                      <button
                        onClick={goToNextUnreviewed}
                        disabled={!reviewerName || unreviewedCount === 0}
                        className="mb-3 flex w-full items-center justify-center gap-2 rounded border border-zinc-700 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Jump to next unreviewed record"
                      >
                        <SkipForward size={16} />
                        Next Unreviewed
                      </button>

                      <div className="flex gap-3">
                        <button
                          onClick={goToPrevious}
                          disabled={currentIndex === 0 || !reviewerName}
                          className="flex flex-1 items-center justify-center gap-2 rounded border-2 border-zinc-700 px-4 py-3 text-white transition-colors hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent"
                          title={!reviewerName ? 'Enter reviewer name to navigate' : ''}
                        >
                          <ChevronLeft size={20} />
                          Previous
                        </button>
                        <button
                          onClick={goToNext}
                          disabled={currentIndex === csvData.length - 1 || !reviewerName}
                          className="flex flex-1 items-center justify-center gap-2 rounded bg-red-600 px-4 py-3 text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-700 disabled:opacity-30 disabled:hover:bg-red-600"
                          title={!reviewerName ? 'Enter reviewer name to navigate' : ''}
                        >
                          Next
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <p className="mt-3 text-center text-sm text-zinc-400">
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
