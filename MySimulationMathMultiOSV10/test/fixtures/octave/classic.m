% A file in the usual dialect: % comments only, "…" is a string value.
%{
block comment
%}
s = "abc";        % a string value: one element
t = 'abc';        % a char array: three characters
fprintf('%d %d\n', numel(s), numel(t));
u = "tab\there";  % no escapes in a string value
fprintf('%d\n', strlength(u));
