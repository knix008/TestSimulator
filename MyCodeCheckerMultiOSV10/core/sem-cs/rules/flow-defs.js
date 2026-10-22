'use strict';

// Rules produced by the symbolic-execution and data-flow engines.

const { R } = require('../registry');

const se = { engine: 'se' };
const flow = { engine: 'flow' };

R('null-dereference', 'S2259', 'B', 'MA', 10, ['symbolic-execution', 'cwe-476'],
  ['Null pointers should not be dereferenced', 'On at least one path the value is known to be null (assigned null or checked against null) and is then dereferenced, which throws NullReferenceException.', 'Check the value for null before the use, or return early.'],
  ['null 참조를 역참조하면 안 됩니다', '적어도 한 경로에서 값이 null(null 대입 또는 null 검사)인데 역참조해 NullReferenceException이 납니다.', '사용하기 전에 null을 검사하거나 먼저 반환하세요.'], se);
R('nullable-value-null', 'S3655', 'B', 'MA', 10, ['symbolic-execution', 'cwe-476'],
  ['Empty nullable value should not be accessed', 'Reading .Value of a Nullable<T> (or casting it) when it has no value throws InvalidOperationException.', 'Check HasValue first or use GetValueOrDefault().'],
  ['비어 있는 nullable 값에 접근하면 안 됩니다', '값이 없는 Nullable<T>의 .Value를 읽거나 캐스팅하면 InvalidOperationException이 납니다.', '먼저 HasValue를 확인하거나 GetValueOrDefault()를 쓰세요.'], se);
R('empty-collection-access', 'S4158', 'B', 'MA', 10, ['symbolic-execution'],
  ['Empty collections should not be accessed or iterated', 'The collection was created empty and nothing was added before it is read, so the loop never runs or the access throws.', 'Fill the collection first, or remove the dead code.'],
  ['빈 컬렉션에 접근하거나 반복하면 안 됩니다', '컬렉션을 비어 있게 만든 뒤 아무것도 넣지 않고 읽어서 반복이 실행되지 않거나 접근이 예외를 던집니다.', '먼저 컬렉션을 채우거나 죽은 코드를 지우세요.'], se);
R('dispose-twice', 'S3966', 'B', 'MA', 10, ['symbolic-execution', 'pitfall'],
  ['Objects should not be disposed more than once', 'Disposing twice (explicitly and again by using, or two Dispose calls) can throw ObjectDisposedException for some types.', 'Dispose once: rely on the using statement or keep a single Dispose call.'],
  ['객체를 두 번 이상 해제하면 안 됩니다', '두 번 해제하면(명시적으로 한 번, using이 또 한 번) 일부 타입은 ObjectDisposedException을 던집니다.', 'using 문에 맡기거나 Dispose를 한 번만 호출하세요.'], se);
R('disposed-object-used', '', 'B', 'CR', 10, ['symbolic-execution', 'cwe-416'],
  ['Disposed objects should not be used', 'Calling a member of an object after Dispose()/Close() throws ObjectDisposedException.', 'Move the use before Dispose, or create a new instance.'],
  ['해제한 객체를 사용하면 안 됩니다', 'Dispose()/Close()한 객체의 멤버를 호출하면 ObjectDisposedException이 납니다.', '사용을 Dispose 앞으로 옮기거나 새 인스턴스를 만드세요.'], se);
R('disposable-not-disposed', 'S2930', 'B', 'MA', 10, ['symbolic-execution', 'cwe-459', 'cwe-404'],
  ['IDisposables should be disposed', 'The object owns an unmanaged resource (file, connection, GDI handle ...) and on some path it is neither disposed nor handed to another owner.', 'Wrap it in a using statement or declaration, or dispose it in finally.'],
  ['IDisposable은 해제해야 합니다', '파일, 연결, GDI 핸들 같은 비관리 자원을 가진 객체를 어떤 경로에서 해제하지도 다른 소유자에게 넘기지도 않습니다.', 'using 문이나 using 선언으로 감싸거나 finally에서 해제하세요.'], se);
R('division-by-zero', '', 'B', 'CR', 10, ['symbolic-execution', 'cwe-369'],
  ['Integers should not be divided by zero', 'The divisor is zero on this path, so integer division or modulo throws DivideByZeroException.', 'Guard the divisor against zero.'],
  ['정수를 0으로 나누면 안 됩니다', '이 경로에서 나누는 값이 0이라 정수 나눗셈이나 나머지 연산이 DivideByZeroException을 던집니다.', '나누는 값이 0이 아닌지 확인하세요.'], se);
R('lock-not-released', 'S2222', 'B', 'CR', 15, ['symbolic-execution', 'multi-threading', 'cwe-667'],
  ['Locks should be released on all paths', 'A Monitor, Mutex or ReaderWriterLock acquired here is not released on every path out of the method, which blocks other threads forever.', 'Release the lock in a finally block, or use the lock statement.'],
  ['잠금은 모든 경로에서 해제해야 합니다', '여기서 얻은 Monitor, Mutex, ReaderWriterLock이 메서드를 나가는 모든 경로에서 해제되지 않아 다른 스레드를 영원히 막습니다.', 'finally 블록에서 해제하거나 lock 문을 쓰세요.'], se);
R('condition-always-same', 'S2589', 'S', 'MA', 10, ['symbolic-execution', 'redundant', 'cwe-571', 'cwe-570'],
  ['Boolean expressions should not be gratuitous', 'Given what is known on every path reaching it, this condition always has the same value, so it is redundant or hides a logic error.', 'Remove the redundant condition or fix the logic.'],
  ['불리언 식이 불필요하면 안 됩니다', '이 조건에 도달하는 모든 경로의 정보로 보면 항상 같은 값이라 불필요하거나 논리 오류를 숨깁니다.', '불필요한 조건을 지우거나 논리를 고치세요.'], se);
R('unreachable-branch', 'S2583', 'B', 'MA', 10, ['symbolic-execution', 'unused', 'cwe-571', 'cwe-570'],
  ['Conditionally executed code should be reachable', 'The condition always evaluates the same way, so one branch can never execute.', 'Fix the condition or delete the dead branch.'],
  ['조건부로 실행되는 코드는 도달할 수 있어야 합니다', '조건이 항상 같게 평가되어 한쪽 분기가 절대 실행되지 않습니다.', '조건을 고치거나 죽은 분기를 지우세요.'], se);
R('dead-store', 'S1854', 'S', 'MA', 15, ['data-flow', 'unused', 'cwe-563'],
  ['Unused assignments should be removed', 'The value assigned here is overwritten or never read on any path, so the computation is wasted or a bug hides here.', 'Remove the assignment, or use the value.'],
  ['쓰지 않는 대입은 지워야 합니다', '여기서 대입한 값은 어떤 경로에서도 읽히지 않거나 덮어써져 계산이 낭비되거나 버그가 숨어 있습니다.', '대입을 지우거나 값을 사용하세요.'], flow);
R('unreachable-code', '', 'B', 'MA', 5, ['data-flow', 'unused', 'cwe-561'],
  ['All code should be reachable', 'This statement follows a return, throw, break, continue or goto and can never execute.', 'Remove the statement or fix the jump before it.'],
  ['모든 코드는 도달할 수 있어야 합니다', '이 문장은 return, throw, break, continue, goto 뒤에 있어 절대 실행되지 않습니다.', '문장을 지우거나 앞의 점프를 고치세요.'], flow);
