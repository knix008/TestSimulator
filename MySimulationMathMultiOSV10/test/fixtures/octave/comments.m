% percent comment line
# hash comment line
## double-hash comment (Octave help style)
%% a section title
a = 1;   % trailing percent comment
b = 2;   # trailing hash comment
%{
  percent block comment
  c = 999;
%}
#{
  hash block comment
  d = 999;
#}
c = a + ...   % continuation with a percent comment
    b;
d = a + ...   # continuation with a hash comment
    b;
s1 = 'it''s % not a comment';
s2 = "# not a comment either";
printf ("%d %d %d %d\n", a, b, c, d);
disp (s1); disp (s2);
x = [1 2 % a comment inside a matrix
     3 4 # another one
    ];
disp (x);
