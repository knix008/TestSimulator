% 소수와 체 / Primes and the sieve
% 에라토스테네스의 체 직접 구현
% The sieve of Eratosthenes by hand
% (script sample — MySimulationMath start page)
% The sieve of Eratosthenes compared with primes().
N = 100;
isP = true(1, N); isP(1) = false;
for k = 2:floor(sqrt(N))
    if isP(k), isP(k*k:k:N) = false; end
end
p = find(isP)
isequal(p, primes(N))
twinPrimes = p([diff(p) == 2, false])
