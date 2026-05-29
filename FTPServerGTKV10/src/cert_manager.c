#include "cert_manager.h"
#include <openssl/pem.h>
#include <openssl/x509.h>
#include <openssl/x509v3.h>
#include <openssl/pkcs12.h>
#include <openssl/rsa.h>
#include <openssl/evp.h>
#include <openssl/err.h>
#include <openssl/rand.h>
#include <string.h>
#include <stdio.h>

bool cert_generate_self_signed(const char *path, const char *password,
                               const char *cn, int years) {
    bool ok = false;
    EVP_PKEY *pkey = NULL;
    X509     *x509 = NULL;
    PKCS12   *p12  = NULL;
    FILE     *fp   = NULL;

    /* Generate RSA 2048 key */
    pkey = EVP_RSA_gen(2048);
    if (!pkey) goto done;

    x509 = X509_new();
    if (!x509) goto done;

    /* Serial number */
    ASN1_INTEGER_set(X509_get_serialNumber(x509), 1);

    /* Validity */
    X509_gmtime_adj(X509_get_notBefore(x509), -86400L);
    X509_gmtime_adj(X509_get_notAfter(x509),  (long)years * 365 * 24 * 3600 + 172800L);

    /* Subject / Issuer (self-signed) */
    X509_NAME *name = X509_get_subject_name(x509);
    X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC,
                               (const unsigned char *)cn, -1, -1, 0);
    X509_set_issuer_name(x509, name);

    /* Public key */
    X509_set_pubkey(x509, pkey);

    /* Extensions */
    X509V3_CTX ctx;
    X509V3_set_ctx_nodb(&ctx);
    X509V3_set_ctx(&ctx, x509, x509, NULL, NULL, 0);

    X509_EXTENSION *ext;
    ext = X509V3_EXT_conf_nid(NULL, &ctx, NID_basic_constraints, "CA:FALSE");
    if (ext) { X509_add_ext(x509, ext, -1); X509_EXTENSION_free(ext); }

    ext = X509V3_EXT_conf_nid(NULL, &ctx, NID_key_usage,
                              "digitalSignature,keyEncipherment");
    if (ext) { X509_add_ext(x509, ext, -1); X509_EXTENSION_free(ext); }

    ext = X509V3_EXT_conf_nid(NULL, &ctx, NID_ext_key_usage, "serverAuth");
    if (ext) { X509_add_ext(x509, ext, -1); X509_EXTENSION_free(ext); }

    /* Sign */
    if (X509_sign(x509, pkey, EVP_sha256()) == 0) goto done;

    /* Export as PKCS#12 */
    p12 = PKCS12_create((char *)password, "FTPServerGTK",
                         pkey, x509, NULL, 0, 0, 0, 0, 0);
    if (!p12) goto done;

    fp = fopen(path, "wb");
    if (!fp) goto done;

    if (i2d_PKCS12_fp(fp, p12)) ok = true;

done:
    if (fp)   fclose(fp);
    if (p12)  PKCS12_free(p12);
    if (x509) X509_free(x509);
    if (pkey) EVP_PKEY_free(pkey);
    return ok;
}

bool cert_verify(const char *path, const char *password) {
    FILE *fp = fopen(path, "rb");
    if (!fp) return false;

    PKCS12 *p12 = d2i_PKCS12_fp(fp, NULL);
    fclose(fp);
    if (!p12) return false;

    EVP_PKEY *pkey = NULL;
    X509     *cert = NULL;
    bool ok = (PKCS12_parse(p12, password, &pkey, &cert, NULL) == 1);

    if (pkey) EVP_PKEY_free(pkey);
    if (cert) X509_free(cert);
    PKCS12_free(p12);
    return ok;
}
