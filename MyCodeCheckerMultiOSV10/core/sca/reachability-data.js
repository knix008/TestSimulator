'use strict';

// Data for vulnerability reachability: how a package shows up in source code
// (module / namespace / header names that differ from the package name) and
// the affected functions of well-known advisories whose OSV records carry no
// symbol information. Symbol syntax:
//   'template'                      member of the package root
//   'yaml.load', 'PIL.ImageMath.eval'  dotted path from the top-level module
//   'ObjectMapper.enableDefaultTyping' Type.method (method calls on any instance)
//   'JndiLookup'                    a type that is referenced
//   '@JsonTypeInfo'                 an annotation / attribute
//   '.order_by'                     a method name called on any object
//   'default'                       calling the module itself (minimist(argv))
//   're:<regex>'                    a raw regular expression on the code
// A symbol group may restrict the import path (Go packages): { path, symbols }.

// PyPI distribution name (normalised) -> importable top-level modules.
const PY_MODULES = {
  pyyaml: ['yaml'], pillow: ['PIL'], 'beautifulsoup4': ['bs4'], 'scikit-learn': ['sklearn'], 'scikit-image': ['skimage'],
  'python-dateutil': ['dateutil'], 'opencv-python': ['cv2'], 'opencv-python-headless': ['cv2'], 'opencv-contrib-python': ['cv2'],
  protobuf: ['google.protobuf'], pyjwt: ['jwt'], pycryptodome: ['Crypto'], pycryptodomex: ['Cryptodome'], 'msgpack-python': ['msgpack'],
  attrs: ['attr', 'attrs'], setuptools: ['setuptools', 'pkg_resources'], 'python-jose': ['jose'], pyopenssl: ['OpenSSL'],
  'mysql-connector-python': ['mysql.connector'], 'mysqlclient': ['MySQLdb'], 'psycopg2-binary': ['psycopg2'], psycopg2: ['psycopg2'],
  'python-magic': ['magic'], 'pymupdf': ['fitz'], 'google-cloud-storage': ['google.cloud.storage'], 'typing-extensions': ['typing_extensions'],
  'jinja2': ['jinja2'], markupsafe: ['markupsafe'], 'pyserial': ['serial'], 'pyusb': ['usb'], 'python-ldap': ['ldap'], 'ldap3': ['ldap3'],
  'django-rest-framework': ['rest_framework'], djangorestframework: ['rest_framework'], 'paho-mqtt': ['paho'], 'websocket-client': ['websocket'],
  'pywin32': ['win32api', 'win32con', 'win32com', 'pythoncom'], 'pyzmq': ['zmq'], 'ruamel-yaml': ['ruamel.yaml'], 'lxml': ['lxml'],
  'tensorflow-cpu': ['tensorflow'], 'tensorflow-gpu': ['tensorflow'], torch: ['torch'], 'faiss-cpu': ['faiss'], 'pyarrow': ['pyarrow'],
};

// Maven "group:artifact" -> Java package prefixes.
const JAVA_PACKAGES = {
  'com.fasterxml.jackson.core:jackson-databind': ['com.fasterxml.jackson.databind'],
  'com.fasterxml.jackson.core:jackson-core': ['com.fasterxml.jackson.core'],
  'com.fasterxml.jackson.core:jackson-annotations': ['com.fasterxml.jackson.annotation'],
  'org.apache.logging.log4j:log4j-core': ['org.apache.logging.log4j'],
  'org.apache.logging.log4j:log4j-api': ['org.apache.logging.log4j'],
  'log4j:log4j': ['org.apache.log4j'],
  'org.apache.commons:commons-text': ['org.apache.commons.text'],
  'org.apache.commons:commons-lang3': ['org.apache.commons.lang3'],
  'org.apache.commons:commons-collections4': ['org.apache.commons.collections4'],
  'commons-collections:commons-collections': ['org.apache.commons.collections'],
  'commons-io:commons-io': ['org.apache.commons.io'],
  'commons-fileupload:commons-fileupload': ['org.apache.commons.fileupload'],
  'org.yaml:snakeyaml': ['org.yaml.snakeyaml'],
  'org.springframework:spring-beans': ['org.springframework.beans', 'org.springframework.web.bind'],
  'org.springframework:spring-webmvc': ['org.springframework.web'],
  'org.springframework:spring-webflux': ['org.springframework.web.reactive'],
  'org.springframework:spring-core': ['org.springframework.core', 'org.springframework.util'],
  'com.google.guava:guava': ['com.google.common'],
  'com.google.code.gson:gson': ['com.google.gson'],
  'org.apache.httpcomponents:httpclient': ['org.apache.http'],
  'com.thoughtworks.xstream:xstream': ['com.thoughtworks.xstream'],
  'org.bouncycastle:bcprov-jdk15on': ['org.bouncycastle'],
  'io.netty:netty-codec-http': ['io.netty.handler.codec.http'],
};

// NuGet id -> C# namespaces (default: the id itself).
const CS_NAMESPACES = {
  'newtonsoft.json': ['Newtonsoft.Json'],
  'system.text.encodings.web': ['System.Text.Encodings.Web'],
  'log4net': ['log4net'],
  'restsharp': ['RestSharp'],
  'dapper': ['Dapper'],
  'automapper': ['AutoMapper'],
  'yamldotnet': ['YamlDotNet'],
  'sharpziplib': ['ICSharpCode.SharpZipLib'],
  'bouncycastle': ['Org.BouncyCastle'],
  'portable.bouncycastle': ['Org.BouncyCastle'],
};

// Packagist name -> PHP namespaces, used when composer.lock has no autoload.
const PHP_NAMESPACES = {
  'guzzlehttp/guzzle': ['GuzzleHttp'],
  'phpmailer/phpmailer': ['PHPMailer\\PHPMailer'],
  'monolog/monolog': ['Monolog'],
  'symfony/http-foundation': ['Symfony\\Component\\HttpFoundation'],
  'twig/twig': ['Twig'],
  'laravel/framework': ['Illuminate'],
};

// RubyGems name -> require paths.
const RUBY_REQUIRES = {
  actionpack: ['action_controller', 'action_dispatch', 'action_pack', 'rails', 'rails/all'],
  actionview: ['action_view', 'rails', 'rails/all'],
  activerecord: ['active_record', 'rails', 'rails/all'],
  activesupport: ['active_support', 'rails', 'rails/all'],
  'rest-client': ['rest-client', 'rest_client'],
};

// ConanCenter / vcpkg name -> include paths (a trailing "/" is a folder prefix).
const C_HEADERS = {
  zlib: ['zlib.h', 'zconf.h'], openssl: ['openssl/'], libcurl: ['curl/'], curl: ['curl/'], libpng: ['png.h'],
  sqlite3: ['sqlite3.h'], expat: ['expat.h'], libxml2: ['libxml/'], boost: ['boost/'], fmt: ['fmt/'],
  'nlohmann_json': ['nlohmann/'], 'nlohmann-json': ['nlohmann/'], libjpeg: ['jpeglib.h'], 'libjpeg-turbo': ['jpeglib.h', 'turbojpeg.h'],
  libwebp: ['webp/'], libtiff: ['tiffio.h', 'tiff.h'], freetype: ['ft2build.h', 'freetype/'], spdlog: ['spdlog/'], protobuf: ['google/protobuf/'],
};

// Affected symbols of well-known advisories (keyed by any id or alias).
const ADVISORY_SYMBOLS = [
  { ids: ['CVE-2021-23337', 'GHSA-35jh-r3h4-6jhm'], symbols: ['template'] },
  { ids: ['CVE-2019-10744', 'GHSA-jf85-cpcp-j695'], symbols: ['defaultsDeep'] },
  { ids: ['CVE-2020-8203', 'GHSA-p6mc-m468-83gw'], symbols: ['zipObjectDeep'] },
  { ids: ['CVE-2018-16487', 'GHSA-4xc9-xhrj-v574'], symbols: ['merge', 'mergeWith', 'defaultsDeep'] },
  { ids: ['CVE-2018-3721', 'GHSA-fvqr-27wr-82fm'], symbols: ['merge', 'mergeWith', 'defaultsDeep', 'extend'] },
  { ids: ['CVE-2021-44906', 'GHSA-xvch-5gv4-984h', 'CVE-2020-7598', 'GHSA-vh95-rmgr-6w4m'], symbols: ['default'] },
  { ids: ['CVE-2019-11358', 'GHSA-6c3j-c64m-qhgq'], symbols: ['extend', '.extend'] },
  { ids: ['CVE-2020-11022', 'GHSA-gxr4-xjj5-5px2'], symbols: ['htmlPrefilter', '.html', '.append', '.prepend', '.before', '.after', '.replaceWith'] },
  { ids: ['CVE-2022-46175', 'GHSA-9c47-m6qq-7p4h'], symbols: ['parse'] },
  { ids: ['CVE-2022-24999', 'GHSA-hrpp-h998-j3pp'], symbols: ['parse'] },
  { ids: ['CVE-2022-25883', 'GHSA-c2qf-rxjj-qqgw'], symbols: ['Range', 'satisfies', 'validRange', 'minVersion', 'maxSatisfying', 'minSatisfying', 'intersects', 'subset'] },
  { ids: ['CVE-2017-7525', 'GHSA-qxxx-2pp7-5hmx'], symbols: ['ObjectMapper.enableDefaultTyping', 'ObjectMapper.activateDefaultTyping', 'ObjectMapper.activateDefaultTypingAsProperty', '@JsonTypeInfo'] },
  { ids: ['CVE-2020-36518', 'GHSA-57j2-w4cx-62h2'], symbols: ['ObjectMapper.readValue', 'ObjectMapper.readTree', 'ObjectReader.readValue'] },
  { ids: ['CVE-2021-44228', 'GHSA-jfh8-c2jp-5v3q', 'CVE-2021-45046', 'GHSA-7rjr-3q55-vv33'], symbols: ['JndiLookup', 'LogManager.getLogger', 'LoggerFactory.getLogger', '@Log4j2'] },
  { ids: ['CVE-2019-17571', 'GHSA-2qrg-x229-3v8q'], symbols: ['SocketServer', 'SimpleSocketServer', 'SocketNode'] },
  { ids: ['CVE-2022-42889', 'GHSA-599f-7c49-w659'], symbols: ['StringSubstitutor.createInterpolator', 'StringLookupFactory', 'StringSubstitutor'] },
  { ids: ['CVE-2022-1471', 'GHSA-mjmj-j48q-9wg2'], symbols: ['Yaml.load', 'Yaml.loadAll', 'Yaml.loadAs', 'Constructor'] },
  { ids: ['CVE-2020-14343', 'GHSA-8q59-q68h-6hv4', 'CVE-2020-1747', 'GHSA-6757-jp84-gxfx'], symbols: ['yaml.load', 'yaml.load_all', 'yaml.full_load', 'yaml.full_load_all', 'yaml.unsafe_load', 'yaml.FullLoader', 'yaml.UnsafeLoader'] },
  { ids: ['CVE-2017-18342', 'GHSA-rprw-h62v-c2w7'], symbols: ['yaml.load', 'yaml.load_all'] },
  { ids: ['CVE-2019-6446', 'GHSA-9fq2-x9r6-wfmf'], symbols: ['numpy.load'] },
  { ids: ['CVE-2022-21797', 'GHSA-6hrg-qmvc-2xh8'], symbols: ['joblib.Parallel'] },
  { ids: ['CVE-2025-32434', 'GHSA-53q9-r3pm-6pq6'], symbols: ['torch.load'] },
  { ids: ['CVE-2022-34265', 'GHSA-p64x-8rxx-wf6q'], symbols: ['django.db.models.functions.Trunc', 'django.db.models.functions.Extract', '.Trunc', '.Extract'] },
  { ids: ['CVE-2021-35042', 'GHSA-xpfp-f569-q3p2'], symbols: ['.order_by'] },
  { ids: ['CVE-2023-50447', 'GHSA-3f63-hfp8-52jq'], symbols: ['PIL.ImageMath.eval'] },
  { ids: ['CVE-2024-22195', 'GHSA-h5c8-rqwp-cp95'], symbols: ['jinja2.filters.do_xmlattr', 're:\\|\\s*xmlattr\\b'] },
  { ids: ['CVE-2024-21907', 'GHSA-5crp-9r3c-p9vr'], symbols: ['JsonConvert.DeserializeObject', 'JsonConvert.PopulateObject', 'JToken.Parse', 'JObject.Parse', 'JArray.Parse', 'JsonSerializer.Deserialize'] },
  { ids: ['CVE-2021-26701', 'GHSA-ghhp-997w-qr28'], symbols: ['HtmlEncoder', 'JavaScriptEncoder', 'UrlEncoder', 'TextEncoder'] },
  { ids: ['CVE-2022-29248', 'GHSA-cwmx-hcrq-mhc3'], symbols: ['CookieJar', 'cookies'] },
  { ids: ['CVE-2016-10033', 'GHSA-5f37-gxvh-23v6'], symbols: ['PHPMailer.setFrom', 'Sender'] },
  { ids: ['CVE-2022-24836', 'GHSA-crjr-9rc5-ghw8'], symbols: ['Nokogiri::HTML', 'Nokogiri::HTML4', 'Nokogiri::HTML::Document'] },
  { ids: ['CVE-2019-5418', 'GHSA-86g5-2wh3-gc9j'], symbols: ['re:\\brender\\s*\\(?\\s*file:'] },
  { ids: ['CVE-2022-37434'], symbols: ['inflateGetHeader'] },
  { ids: ['RUSTSEC-2022-0013', 'CVE-2022-24713'], symbols: ['regex::Regex::new', 'regex::RegexBuilder', 'regex::RegexSet::new', 'regex::bytes::Regex::new'] },
  { ids: ['RUSTSEC-2021-0003', 'CVE-2021-25900'], symbols: ['smallvec::SmallVec::insert_many'] },
  { ids: ['RUSTSEC-2023-0001', 'CVE-2023-22466'], symbols: ['tokio::net::windows::named_pipe::ServerOptions::reject_remote_clients'] },
  { ids: ['GO-2023-2102', 'CVE-2023-39325'], groups: [{ path: 'golang.org/x/net/http2', symbols: ['ConfigureServer', 'Server.ServeConn'] }] },
  { ids: ['GO-2023-1571', 'CVE-2022-41723'], groups: [{ path: 'golang.org/x/net/http2', symbols: ['ConfigureServer', 'Server.ServeConn', 'Transport.RoundTrip'] }, { path: 'golang.org/x/net/http2/hpack', symbols: ['Decoder.DecodeFull', 'Decoder.Write'] }] },
  { ids: ['GO-2023-2402', 'CVE-2023-48795'], groups: [{ path: 'golang.org/x/crypto/ssh', symbols: ['NewClientConn', 'NewServerConn', 'Dial'] }] },
  { ids: ['GO-2022-1059', 'CVE-2022-32149'], groups: [{ path: 'golang.org/x/text/language', symbols: ['ParseAcceptLanguage', 'MatchStrings', 'Parse'] }] },
  { ids: ['GO-2020-0017', 'CVE-2020-26160'], groups: [{ path: 'github.com/dgrijalva/jwt-go', symbols: ['MapClaims.VerifyAudience', 'StandardClaims.VerifyAudience', 'Parse', 'ParseWithClaims'] }] },
];

module.exports = { PY_MODULES, JAVA_PACKAGES, CS_NAMESPACES, PHP_NAMESPACES, RUBY_REQUIRES, C_HEADERS, ADVISORY_SYMBOLS };
