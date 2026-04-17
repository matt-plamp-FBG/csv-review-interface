select c.case_number,* 
from fbg_analytics.operations.chatbot_cases B
join fbg_analytics.operations.cs_cases C on B.case_id=C.case_id
where B.is_ai_agent = 'True'
and date (B.case_created_est) BETWEEN '2026-04-15' AND '2026-04-16'
and B.case_type in ('Betting')
order by B.case_created_est desc
limit 50
