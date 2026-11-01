-- 저장하는 키워드의 길이를 DB에서도 막는다. (서버 검사와 같은 1~50자, 보안 점검 SEC-002)
alter table keywords add constraint keywords_text_length check (char_length(text) between 1 and 50);
