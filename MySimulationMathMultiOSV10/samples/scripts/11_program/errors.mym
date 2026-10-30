% 오류 처리 / Error handling
% try/catch, 사용자 오류, 오류 식별자
% try/catch, custom errors and identifiers
% (script sample — MySimulationMath start page)
% Error handling with try / catch.
try
    x = [1 2 3] * [4 5 6];        % inner dimensions do not agree
catch err
    fprintf('Caught: %s\n', err.message);
end
try
    error('demo:negative', 'Value %d must be positive.', -5);
catch err
    fprintf('id = %s, message = %s\n', err.identifier, err.message);
end
warning('This is a warning; execution continues.');
disp('Still running.');
