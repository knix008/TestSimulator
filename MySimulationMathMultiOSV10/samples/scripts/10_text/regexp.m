% 정규 표현식 / Regular expressions
% 날짜와 전자 우편 주소 뽑아내기
% Extracting dates and e-mail addresses
% (script sample — MySimulationMath start page)
% Regular expressions: find dates and e-mail addresses in text.
txt = 'Meeting on 2026-10-28 with kim@example.com; follow-up 2026-11-03 (lee@test.org).';
dates = regexp(txt, '\d{4}-\d{2}-\d{2}', 'match')
emails = regexp(txt, '[\w.]+@[\w.]+\w', 'match')
parts = regexp(txt, '(\d{4})-(\d{2})-(\d{2})', 'tokens');
months = cellfun(@(c) str2double(c{2}), parts)
masked = regexprep(txt, '(\w)[\w.]*@', '$1***@')
