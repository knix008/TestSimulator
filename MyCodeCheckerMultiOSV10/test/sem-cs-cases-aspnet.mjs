// sem-cs samples: aspnet rules. See sem-cs-cases.mjs for the format.
const U = `using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
`;

export default {
  'aspnet-route-template-slash': {
    bad: `${U}
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpGet("/all")] // Noncompliant
    public IActionResult All() => Ok();
    [HttpGet("{id}")]
    public IActionResult One(int id) => Ok();
}`,
    good: `${U}
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpGet("all")]
    public IActionResult All() => Ok();
}
public class HomeController : Controller
{
    [HttpGet("/home")]
    public IActionResult Index() => View();
}`,
  },
  'aspnet-controller-route-missing': {
    bad: `${U}
public class ItemsController : ControllerBase // Noncompliant
{
    [HttpGet("items/{id}")]
    public IActionResult Get(int id) => Ok();
}`,
    good: `${U}
[Route("items")]
public class ItemsController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult Get(int id) => Ok();
}
public class HomeController : Controller
{
    public IActionResult Index() => View();
}`,
  },
  'aspnet-route-backslash': {
    bad: `${U}
[Route(@"api\\files")] // Noncompliant
public class FilesController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult Get(int id) => Ok();
}`,
    good: `${U}
[Route("api/files")]
public class FilesController : ControllerBase
{
    [HttpGet(@"{name:regex(^\\w+$)}")]
    public IActionResult Get(string name) => Ok();
}`,
  },
  'aspnet-route-param-unbound': {
    bad: `${U}
[Route("api/users")]
public class UsersController : ControllerBase
{
    [HttpGet("{userId}")] // Noncompliant
    public IActionResult Get(int id) => Ok(id);
}`,
    good: `${U}
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult Get(int id) => Ok(id);
    [HttpGet("{key}/name")]
    public IActionResult Name([FromRoute(Name = "key")] string k) => Ok(k);
}`,
  },
  'aspnet-duplicate-route': {
    bad: `${U}
[Route("api/products")]
public class ProductsController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult Get(int id) => Ok(id);
    [HttpGet("{id}")] // Noncompliant
    public IActionResult Find(int id) => Ok(id);
}`,
    good: `${U}
[Route("api/products")]
public class ProductsController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult Get(int id) => Ok(id);
    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => NoContent();
}`,
  },
  'aspnet-missing-http-verb': {
    bad: `${U}
[ApiController]
[Route("api/stock")]
public class StockController : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok();
    public IActionResult Refresh() => Ok(); // Noncompliant
}`,
    good: `${U}
[ApiController]
[Route("api/stock")]
public class StockController : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok();
    [NonAction]
    public int Helper() => 1;
}`,
  },
  'aspnet-mixed-responsibilities': {
    bad: `${U}
public interface IUserService { object Get(int id); void Save(object u); }
public interface IPaymentService { object Pay(int id); void Refund(int id); }
public class AccountController : ControllerBase // Noncompliant
{
    private readonly IUserService users;
    private readonly IPaymentService payments;
    public AccountController(IUserService users, IPaymentService payments)
    {
        this.users = users;
        this.payments = payments;
    }
    [HttpGet] public IActionResult Profile(int id) => Ok(users.Get(id));
    [HttpPost] public IActionResult SaveProfile(int id) { users.Save(id); return Ok(); }
    [HttpPost] public IActionResult Pay(int id) => Ok(payments.Pay(id));
    [HttpPost] public IActionResult Refund(int id) { payments.Refund(id); return Ok(); }
}`,
    good: `${U}
public interface IUserService { object Get(int id); void Save(object u); }
public interface IPaymentService { object Pay(int id, object u); }
public class AccountController : ControllerBase
{
    private readonly IUserService users;
    private readonly IPaymentService payments;
    public AccountController(IUserService users, IPaymentService payments)
    {
        this.users = users;
        this.payments = payments;
    }
    [HttpGet] public IActionResult Profile(int id) => Ok(users.Get(id));
    [HttpPost] public IActionResult SaveProfile(int id) { users.Save(id); return Ok(); }
    [HttpPost] public IActionResult Pay(int id) => Ok(payments.Pay(id, users.Get(id)));
    [HttpPost] public IActionResult Again(int id) => Ok(payments.Pay(id, null));
}`,
  },
  'aspnet-api-controller-base': {
    bad: `${U}
[ApiController]
[Route("api/notes")]
public class NotesController : Controller // Noncompliant
{
    [HttpGet] public IActionResult List() => Ok();
}`,
    good: `${U}
[ApiController]
[Route("api/notes")]
public class NotesController : ControllerBase
{
    [HttpGet] public IActionResult List() => Ok();
}
[ApiController]
[Route("notes")]
public class NotesPageController : Controller
{
    [HttpGet] public IActionResult Page() => View();
}`,
  },
  'aspnet-controller-suffix': {
    bad: `${U}
public class Reports : Controller // Noncompliant
{
    public IActionResult Index() => View();
}`,
    good: `${U}
public class ReportsController : Controller
{
    public IActionResult Index() => View();
}
[Controller]
public class Reports2 : Controller
{
    public IActionResult Index() => View();
}`,
  },
  'aspnet-static-controller-state': {
    bad: `${U}
public class CartController : Controller
{
    private static string lastUser; // Noncompliant
    private static int hits; // Noncompliant
    public IActionResult Add(string user)
    {
        lastUser = user;
        hits++;
        return View();
    }
}`,
    good: `${U}
public class CartController : Controller
{
    private static readonly object Gate = new object();
    private static int created;
    private string lastUser;
    public IActionResult Add(string user)
    {
        lastUser = user;
        return View(lastUser);
    }
    private static void Count() { created++; }
}`,
  },
  'aspnet-httpclient-direct': {
    bad: `${U}
using System.Net.Http;
public class WeatherController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        using var client = new HttpClient(); // Noncompliant
        return Ok(await client.GetStringAsync("https://api.contoso.com/weather"));
    }
}`,
    good: `${U}
using System.Net.Http;
public class WeatherController : ControllerBase
{
    private readonly IHttpClientFactory factory;
    public WeatherController(IHttpClientFactory factory) { this.factory = factory; }
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var client = factory.CreateClient();
        return Ok(await client.GetStringAsync("https://api.contoso.com/weather"));
    }
}`,
  },
  'aspnet-modelstate-unchecked': {
    bad: `${U}
public class ContactModel { public string Email { get; set; } }
public class ContactController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Send(ContactModel model) // Noncompliant
    {
        return RedirectToAction("Done");
    }
}`,
    good: `${U}
public class ContactModel { public string Email { get; set; } }
public class ContactController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Send(ContactModel model)
    {
        if (!ModelState.IsValid) return View(model);
        return RedirectToAction("Done");
    }
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Remove(int id) => RedirectToAction("Done");
}
[ApiController]
public class ContactApiController : ControllerBase
{
    [HttpPost("api/contact")]
    public IActionResult Send(ContactModel model) => Ok();
}`,
  },
  'aspnet-produces-response-type': {
    bad: `${U}
public class Book { public string Title { get; set; } }
[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult Get(int id) // Noncompliant
    {
        return Ok(new Book());
    }
    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => NoContent();
}`,
    good: `${U}
public class Book { public string Title { get; set; } }
[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(Book), 200)]
    public IActionResult Get(int id) => Ok(new Book());
    [HttpGet]
    public ActionResult<Book> First() => new Book();
}`,
  },
  'aspnet-raw-request-access': {
    bad: `${U}
public class SearchController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Find()
    {
        string term = Request.Form["term"]; // Noncompliant
        string page = Request.Query["page"]; // Noncompliant
        return View((object)(term + page));
    }
}`,
    good: `${U}
public class SearchController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Find([FromForm] string term, [FromQuery] int page)
    {
        return View((object)(term + page));
    }
}`,
  },
  'aspnet-multiple-frombody': {
    bad: `${U}
public class A { } public class B { }
[ApiController]
[Route("api/x")]
public class XController : ControllerBase
{
    [HttpPost]
    public IActionResult Post([FromBody] A a, [FromBody] B b) => Ok(); // Noncompliant
}`,
    good: `${U}
public class A { } public class B { }
public class AB { public A A { get; set; } public B B { get; set; } }
[ApiController]
[Route("api/x")]
public class XController : ControllerBase
{
    [HttpPost]
    public IActionResult Post([FromBody] AB ab, [FromQuery] int v) => Ok();
}`,
  },
  'aspnet-value-type-underposting': {
    bad: `${U}
public class OrderInput
{
    public string Product { get; set; }
    public int Quantity { get; set; } // Noncompliant
    public bool Express { get; set; } // Noncompliant
}
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(OrderInput input) => Ok();
}`,
    good: `${U}
public class OrderInput
{
    public string Product { get; set; }
    public int? Quantity { get; set; }
    public required bool Express { get; set; }
    [System.Text.Json.Serialization.JsonRequired] public decimal Price { get; set; }
    public int Total => 0;
}
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(OrderInput input) => Ok();
}`,
  },
  'aspnet-action-no-cancellation': {
    bad: `${U}
public interface IRepo { Task<object> LoadAsync(int id); Task<object> LoadAsync(int id, CancellationToken ct); }
[ApiController]
[Route("api/r")]
public class RepoController : ControllerBase
{
    private readonly IRepo repo;
    public RepoController(IRepo repo) { this.repo = repo; }
    [HttpGet("{id}")]
    public async Task<IActionResult> Get(int id) // Noncompliant
    {
        return Ok(await repo.LoadAsync(id));
    }
}`,
    good: `${U}
public interface IRepo { Task<object> LoadAsync(int id, CancellationToken ct); }
[ApiController]
[Route("api/r")]
public class RepoController : ControllerBase
{
    private readonly IRepo repo;
    public RepoController(IRepo repo) { this.repo = repo; }
    [HttpGet("{id}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        return Ok(await repo.LoadAsync(id, ct));
    }
    [HttpGet("{id}/again")]
    public async Task<IActionResult> Again(int id)
    {
        return Ok(await repo.LoadAsync(id, HttpContext.RequestAborted));
    }
}`,
  },
  'aspnet-get-modifies-state': {
    bad: `${U}
public class Db { public void Remove(object o) { } public int SaveChanges() => 0; }
public class ItemsController : Controller
{
    private readonly Db db;
    public ItemsController(Db db) { this.db = db; }
    [HttpGet]
    public IActionResult Delete(int id) // Noncompliant
    {
        db.Remove(id);
        db.SaveChanges();
        return RedirectToAction("Index");
    }
}`,
    good: `${U}
public class Db { public void Remove(object o) { } public int SaveChanges() => 0; }
public class ItemsController : Controller
{
    private readonly Db db;
    public ItemsController(Db db) { this.db = db; }
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Delete(int id)
    {
        db.Remove(id);
        db.SaveChanges();
        return RedirectToAction("Index");
    }
    [HttpGet]
    public IActionResult Index() => View();
}`,
  },
  'aspnet-csrf-disabled': {
    bad: `${U}
public class TransferController : Controller
{
    [HttpPost]
    [IgnoreAntiforgeryToken] // Noncompliant
    public IActionResult Send(int amount) => View();
}
public static class Setup
{
    public static void Configure(Microsoft.AspNetCore.Mvc.MvcOptions options)
    {
        options.Filters.Add(new IgnoreAntiforgeryTokenAttribute()); // Noncompliant
    }
}`,
    good: `${U}
public class TransferController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Send(int amount) => View();
}
public static class Setup
{
    public static void Configure(Microsoft.AspNetCore.Mvc.MvcOptions options)
    {
        options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
    }
}`,
  },
  'aspnet-post-missing-antiforgery': {
    bad: `${U}
public class ProfileController : Controller
{
    [HttpGet]
    public IActionResult Edit() => View();
    [HttpPost]
    public IActionResult Edit(string name) => View(); // Noncompliant
}`,
    good: `${U}
public class ProfileController : Controller
{
    [HttpGet]
    public IActionResult Edit() => View();
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Edit(string name) => View();
}
[ApiController]
[Route("api/profile")]
public class ProfileApiController : ControllerBase
{
    [HttpPost]
    public IActionResult Save(string name) => Ok();
}`,
  },
  'aspnet-anonymous-mutation': {
    bad: `${U}
[Authorize]
[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("status")]
    public IActionResult Status() => Ok();
    [AllowAnonymous] // Noncompliant
    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => NoContent();
}`,
    good: `${U}
[Authorize]
[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("status")]
    public IActionResult Status() => Ok();
    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => NoContent();
}`,
  },
  'aspnet-authorize-empty-roles': {
    bad: `${U}
[Authorize(Roles = "")] // Noncompliant
public class SettingsController : Controller
{
    public IActionResult Index() => View();
}`,
    good: `${U}
[Authorize(Roles = "Admin,Manager")]
public class SettingsController : Controller
{
    [Authorize(Policy = "CanEdit")]
    public IActionResult Index() => View();
}`,
  },
  'aspnet-request-validation-disabled': {
    bad: `using System.Web.Mvc;
public class CommentModel
{
    [AllowHtml] // Noncompliant
    public string Body { get; set; }
}
public class CommentController : Controller
{
    [ValidateInput(false)] // Noncompliant
    public ActionResult Post(CommentModel m) => View();
}`,
    good: `using System.Web.Mvc;
public class CommentModel
{
    public string Body { get; set; }
}
public class CommentController : Controller
{
    [ValidateInput(true)]
    public ActionResult Post(CommentModel m) => View();
}`,
  },
  'aspnet-request-size-limit': {
    bad: `${U}
public class UploadController : ControllerBase
{
    [HttpPost("upload")]
    [RequestSizeLimit(100 * 1024 * 1024)] // Noncompliant
    public IActionResult Upload() => Ok();
    [HttpPost("big")]
    [DisableRequestSizeLimit] // Noncompliant
    public IActionResult Big() => Ok();
}
public static class Kestrel
{
    public static void Configure(dynamic o)
    {
        o.Limits.MaxRequestBodySize = null; // Noncompliant
    }
}`,
    good: `${U}
public class UploadController : ControllerBase
{
    [HttpPost("upload")]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public IActionResult Upload() => Ok();
}
public static class Kestrel
{
    public static void Configure(dynamic o)
    {
        o.Limits.MaxRequestBodySize = 1000000;
    }
}`,
  },
  'aspnet-clear-text-url': {
    bad: `using System;
public class Client
{
    private const string Api = "http://api.contoso.com/v1"; // Noncompliant
    public Uri Files() => new Uri("ftp://files.contoso.com/pub"); // Noncompliant
}`,
    good: `using System;
public class Client
{
    private const string Api = "https://api.contoso.com/v1";
    private const string Local = "http://localhost:5000";
    private const string Ns = "http://www.w3.org/2001/XMLSchema";
    public bool IsPlain(string u) => u.StartsWith("http://");
}`,
  },
  'aspnet-hardcoded-secret': {
    bad: `using System.Collections.Generic;
public class Settings
{
    private const string ApiKey = "AKx9f8Qw7Zr2Lm5Np0Vb"; // Noncompliant
    public string ClientSecret { get; set; } = "s3cr3tV4lu3XyZ123"; // Noncompliant
    public Dictionary<string, string> Values() => new Dictionary<string, string>
    {
        ["Jwt:SigningKey"] = "Zq8Wn3Rt6Yp1Km4Hs7Dv", // Noncompliant
    };
}`,
    good: `using System;
using System.Collections.Generic;
public class Settings
{
    private const string ApiKeyHeader = "X-Api-Key-2024-v1";
    public string ClientSecret { get; set; } = Environment.GetEnvironmentVariable("CLIENT_SECRET");
    public string Token { get; set; } = "changeme-token-0001";
    public Dictionary<string, string> Values() => new Dictionary<string, string>
    {
        ["Jwt:Issuer"] = "issuer-2024-main-01",
    };
}`,
  },
  'aspnet-unencoded-html': {
    bad: `${U}
using Microsoft.AspNetCore.Html;
public class PageController : Controller
{
    public IActionResult Show(string body)
    {
        return Content(body, "text/html"); // Noncompliant
    }
    public object Wrap(string body) => new HtmlString(body); // Noncompliant
}`,
    good: `${U}
using Microsoft.AspNetCore.Html;
public class PageController : Controller
{
    public IActionResult Show(string body)
    {
        return Content(body, "text/plain");
    }
    public object Wrap() => new HtmlString("<b>fixed</b>");
}`,
  },
  'aspnet-upload-filename-path': {
    bad: `${U}
using System.IO;
using Microsoft.AspNetCore.Http;
public class UploadController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Save(IFormFile file)
    {
        var path = Path.Combine("uploads", file.FileName); // Noncompliant
        var name = file.FileName; // Noncompliant
        System.IO.File.WriteAllText(name, "x");
        return View((object)path);
    }
}`,
    good: `${U}
using System.IO;
using Microsoft.AspNetCore.Http;
public class UploadController : Controller
{
    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Save(IFormFile file)
    {
        var path = Path.Combine("uploads", Path.GetFileName(file.FileName));
        var stored = Path.Combine("uploads", Guid.NewGuid().ToString("N"));
        return View((object)(path + stored + file.FileName.Length));
    }
}`,
  },
  'aspnet-open-redirect': {
    bad: `${U}
public class LoginController : Controller
{
    [HttpGet]
    public IActionResult Done(string returnUrl)
    {
        return Redirect(returnUrl); // Noncompliant
    }
}`,
    good: `${U}
public class LoginController : Controller
{
    [HttpGet]
    public IActionResult Done(string returnUrl)
    {
        if (Url.IsLocalUrl(returnUrl)) return Redirect(returnUrl);
        return Redirect("/");
    }
    [HttpGet]
    public IActionResult Back(string returnUrl) => LocalRedirect(returnUrl);
}`,
  },
  'aspnet-exception-details': {
    bad: `${U}
[ApiController]
[Route("api/jobs")]
public class JobsController : ControllerBase
{
    [HttpPost]
    public IActionResult Run()
    {
        try { return Ok(); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); } // Noncompliant
        catch (Exception ex) { return StatusCode(500, ex.ToString()); } // Noncompliant
    }
}`,
    good: `${U}
[ApiController]
[Route("api/jobs")]
public class JobsController : ControllerBase
{
    [HttpPost]
    public IActionResult Run()
    {
        try { return Ok(); }
        catch (Exception ex) { Console.Error.WriteLine(ex); return StatusCode(500, "The job failed."); }
    }
}`,
  },
};
