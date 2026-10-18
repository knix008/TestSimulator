// PlantUML examples of the kinds beyond UML (Gantt, WBS, chronology, ArchiMate, nwdiag, JSON, YAML, EBNF,
// regex, Salt): offered in the text-import popup. Each one imports without warnings (test/unit/newtypes.test.js).
export const PLANTUML_MORE_EXAMPLES = {
  gantt: `@startgantt
title Shop launch
Project starts 2026-09-01
saturday are closed
sunday are closed
2026-09-10 is closed
-- Build --
[Design shop] as [D] lasts 5 days
[D] is 100% completed
[Build backend] lasts 10 days
[Build backend] starts at [D]'s end
[Build backend] on {Alice} {Bob:50%}
[Build backend] is 40% completed
[Build frontend] requires 8 days
[D] -> [Build frontend]
[Build frontend] is colored in LightGreen
-- Launch --
[Test] lasts 4 days
[Test] starts at [Build backend]'s end
[Go live] happens at [Test]'s end
@endgantt`,
  wbs: `@startwbs
* Online shop
** Planning
*** Requirements
*** Schedule
** Build
*** Frontend
*** Backend
****< Payments
****> Orders
**< Marketing
*** Launch campaign
@endwbs`,
  chronology: `@startchronology
Project starts 2026-01-01
[Kick-off] happens on 2026-01-12
[Beta] happens on 2026-06-01
[Development] starts 2026-02-01 and ends 2026-05-20
[Launch] happens on 2026-09-01
[Beta] -> [Launch]
@endchronology`,
  archimate: `@startuml
!include <archimate/Archimate>
title Order handling
archimate #Business "Customer" as customer <<business-actor>>
archimate #Business "Order process" as process <<business-process>>
Business_Service(service, "Order service")
Application_Component(shop, "Web shop")
Application_Service(api, "Order API")
Technology_Node(server, "App server")
Motivation_Goal(goal, "More online sales")
Grouping(front, "Front office") {
  Business_Role(clerk, "Clerk")
}
Rel_Serving(service, customer, "serves")
Rel_Realization_Up(process, service)
Rel_Serving(api, process)
Rel_Realization(shop, api)
Rel_Assignment(server, shop)
Rel_Influence(goal, process, "+")
Rel_Assignment(clerk, process)
Rel_Triggering(process, service)
@enduml`,
  nwdiag: `@startnwdiag
nwdiag {
  internet [shape = cloud];
  internet -- router;
  network dmz {
    address = "210.10.0.0/24"
    router [address = "210.10.0.1"];
    web01 [address = "210.10.0.11", description = "Web server"];
    web02 [address = "210.10.0.12"];
  }
  network internal {
    address = "172.16.0.0/24";
    web01 [address = "172.16.0.11"];
    web02 [address = "172.16.0.12"];
    db01 [address = "172.16.0.50", shape = database];
  }
  group web {
    color = "#FFAAAA";
    web01;
    web02;
  }
}
@endnwdiag`,
  json: `@startjson
{
  "order": 1001,
  "customer": { "name": "Kim", "vip": true },
  "items": [ { "sku": "BK-1", "qty": 2 }, { "sku": "CF-9", "qty": 1 } ],
  "coupon": null
}
@endjson`,
  yaml: `@startyaml
order: 1001
customer:
  name: Kim
  vip: true
items:
  - sku: BK-1
    qty: 2
@endyaml`,
  ebnf: `@startebnf
title Order number
order number = "ORD", "-", year, "-", digit, { digit };
year = digit, digit, digit, digit;
digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
@endebnf`,
  regex: `@startregex
title Coupon code
[A-Z]{3}-\\d{4}(-[A-Z])?
@endregex`,
  salt: `@startsalt
{+
  Login    | "user@shop.example "
  Password | "****       "
  [X] Remember me | ^Korean^
  ()  Card | (X) Bank
  [Cancel] | [  OK  ]
}
@endsalt`,
};
