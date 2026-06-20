using ReqTrace.Models;

namespace GenerateKoSample;

internal static class SampleDefinitions
{
    internal sealed record Row(
        string Code,
        string Title,
        string Description,
        string Category,
        Priority Priority,
        RequirementStatus Status,
        string Source,
        string? ParentCode);

    internal static readonly Row[] English =
    {
        new("REQ-001", "User Registration", "The system shall allow a new user to register an account using an email address and password. The password must be at least 8 characters and include a number.", "Authentication", Priority.High, RequirementStatus.Approved, "Spec v1.2", null),
        new("REQ-002", "User Login", "The system shall allow a registered user to log in using their email and password. After 5 consecutive failed attempts, the account is locked for 15 minutes.", "Authentication", Priority.Critical, RequirementStatus.Approved, "Spec v1.2", null),
        new("REQ-003", "Password Reset", "The system shall allow a user to reset their password via an email link. The reset link expires after 30 minutes.", "Authentication", Priority.Medium, RequirementStatus.Approved, "Spec v1.2", "REQ-002"),
        new("REQ-004", "Product Search", "The system shall allow a user to search the product catalog by keyword. Results must return within 2 seconds for catalogs up to 100,000 items.", "Catalog", Priority.High, RequirementStatus.Approved, "Spec v1.3", null),
        new("REQ-005", "Product Filtering", "The system shall allow search results to be filtered by category, price range, and availability.", "Catalog", Priority.Medium, RequirementStatus.InProgress, "Spec v1.3", "REQ-004"),
        new("REQ-006", "Shopping Cart - Add Item", "The system shall allow a user to add a product to the shopping cart, specifying a quantity between 1 and the available stock.", "Cart", Priority.Critical, RequirementStatus.Approved, "Spec v1.4", null),
        new("REQ-007", "Shopping Cart - Remove Item", "The system shall allow a user to remove an item from the shopping cart or update its quantity.", "Cart", Priority.High, RequirementStatus.Approved, "Spec v1.4", "REQ-006"),
        new("REQ-008", "Checkout Process", "The system shall guide the user through a checkout flow including shipping address, payment method, and order review before final confirmation.", "Checkout", Priority.Critical, RequirementStatus.Draft, "Spec v1.5", null),
        new("REQ-009", "Payment Processing", "The system shall process credit card payments through a third-party payment gateway and handle declined transactions with a clear error message.", "Checkout", Priority.Critical, RequirementStatus.Draft, "Spec v1.5", "REQ-008"),
        new("REQ-010", "Order Confirmation Email", "The system shall send an order confirmation email to the user within 1 minute of a successful checkout.", "Notifications", Priority.Medium, RequirementStatus.Draft, "Spec v1.5", "REQ-008"),
        new("REQ-011", "Order History", "The system shall allow a logged-in user to view a list of their past orders with status, date, and total amount.", "Account", Priority.Medium, RequirementStatus.Approved, "Spec v1.6", null),
        new("REQ-012", "Admin Inventory Management", "The system shall allow an administrator to update product stock levels and mark items as out of stock.", "Admin", Priority.High, RequirementStatus.InProgress, "Spec v1.6", null),
    };

    internal static readonly Row[] Korean =
    {
        new("REQ-001", "사용자 등록", "시스템은 신규 사용자가 이메일 주소와 비밀번호로 계정을 등록할 수 있어야 한다. 비밀번호는 최소 8자 이상이며 숫자를 포함해야 한다.", "인증", Priority.High, RequirementStatus.Approved, "명세 v1.2", null),
        new("REQ-002", "사용자 로그인", "시스템은 등록된 사용자가 이메일과 비밀번호로 로그인할 수 있어야 한다. 연속 5회 로그인 실패 시 계정은 15분간 잠긴다.", "인증", Priority.Critical, RequirementStatus.Approved, "명세 v1.2", null),
        new("REQ-003", "비밀번호 재설정", "시스템은 사용자가 이메일 링크를 통해 비밀번호를 재설정할 수 있어야 한다. 재설정 링크는 30분 후 만료된다.", "인증", Priority.Medium, RequirementStatus.Approved, "명세 v1.2", "REQ-002"),
        new("REQ-004", "상품 검색", "시스템은 사용자가 키워드로 상품 카탈로그를 검색할 수 있어야 한다. 10만 건 이하 카탈로그에서는 결과가 2초 이내에 반환되어야 한다.", "카탈로그", Priority.High, RequirementStatus.Approved, "명세 v1.3", null),
        new("REQ-005", "상품 필터링", "시스템은 검색 결과를 카테고리, 가격 범위, 재고 여부로 필터링할 수 있어야 한다.", "카탈로그", Priority.Medium, RequirementStatus.InProgress, "명세 v1.3", "REQ-004"),
        new("REQ-006", "장바구니 - 상품 추가", "시스템은 사용자가 상품을 장바구니에 추가할 수 있어야 한다. 수량은 1부터 재고 수량까지 지정할 수 있어야 한다.", "장바구니", Priority.Critical, RequirementStatus.Approved, "명세 v1.4", null),
        new("REQ-007", "장바구니 - 상품 제거", "시스템은 사용자가 장바구니에서 상품을 제거하거나 수량을 변경할 수 있어야 한다.", "장바구니", Priority.High, RequirementStatus.Approved, "명세 v1.4", "REQ-006"),
        new("REQ-008", "결제 프로세스", "시스템은 배송지, 결제 수단, 주문 검토 단계를 포함한 결제 흐름을 안내해야 한다. 최종 확인 전까지 각 단계를 거쳐야 한다.", "결제", Priority.Critical, RequirementStatus.Draft, "명세 v1.5", null),
        new("REQ-009", "결제 처리", "시스템은 제3자 결제 게이트웨이를 통해 신용카드 결제를 처리해야 한다. 거절된 거래에는 명확한 오류 메시지를 표시해야 한다.", "결제", Priority.Critical, RequirementStatus.Draft, "명세 v1.5", "REQ-008"),
        new("REQ-010", "주문 확인 이메일", "시스템은 결제 완료 후 1분 이내에 사용자에게 주문 확인 이메일을 발송해야 한다.", "알림", Priority.Medium, RequirementStatus.Draft, "명세 v1.5", "REQ-008"),
        new("REQ-011", "주문 내역", "시스템은 로그인한 사용자가 상태, 날짜, 총액을 포함한 과거 주문 목록을 조회할 수 있어야 한다.", "계정", Priority.Medium, RequirementStatus.Approved, "명세 v1.6", null),
        new("REQ-012", "관리자 재고 관리", "시스템은 관리자가 상품 재고 수량을 업데이트하고 품절 상태로 표시할 수 있어야 한다.", "관리", Priority.High, RequirementStatus.InProgress, "명세 v1.6", null),
    };
}
