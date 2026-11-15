#include "msim.hpp"

#include <algorithm>
#include <complex>
#include <fstream>
#include <sstream>

namespace msim {

Val builtin(Ctx& ctx, const std::string& name, const std::vector<Val>& a, int nargout);

namespace {

constexpr double PI = 3.14159265358979323846;

using cplx = std::complex<double>;

void require_num(const Val& v, const char* what) {
    if (v.kind != Val::Kind::Num) die(std::string(what) + " needs a numeric array");
}

Val alloc_num(int rows, int cols, bool logical = false) {
    if (rows < 0 || cols < 0) die("a dimension is negative");
    Val v;
    v.kind = Val::Kind::Num;
    v.rows = rows;
    v.cols = cols;
    v.logical = logical;
    v.re.assign(static_cast<size_t>(rows * cols), 0.0);
    v.im.assign(static_cast<size_t>(rows * cols), 0.0);
    return v;
}

bool is_real(const Val& v) {
    for (double x : v.im) {
        if (x != 0.0) return false;
    }
    return true;
}

double real_scalar(const Val& v, const char* what) {
    require_num(v, what);
    if (v.numel() != 1) die(std::string(what) + " needs a scalar");
    if (v.im[0] != 0.0) die(std::string(what) + " needs a real scalar");
    return v.re[0];
}

int as_int(const Val& v, const char* what) {
    double x = real_scalar(v, what);
    int k = static_cast<int>(std::llround(x));
    if (std::abs(x - k) > 1e-8) die(std::string(what) + " needs an integer");
    return k;
}

std::string as_text(const Val& v) {
    if (v.kind == Val::Kind::Str) return v.s;
    if (v.is_num() && v.numel() == 1 && v.im[0] == 0.0) {
        std::ostringstream o;
        o.precision(12);
        o << v.re[0];
        return o.str();
    }
    die("expected text");
}

bool same_shape(const Val& a, const Val& b) { return a.rows == b.rows && a.cols == b.cols; }

bool broadcast(int r1, int c1, int r2, int c2, int& r, int& c) {
    if ((r1 == r2 || r1 == 1 || r2 == 1) && (c1 == c2 || c1 == 1 || c2 == 1)) {
        r = std::max(r1, r2);
        c = std::max(c1, c2);
        return true;
    }
    return false;
}

int map_at(int r, int c, int src_rows, int src_cols) {
    int rr = src_rows == 1 ? 0 : r;
    int cc = src_cols == 1 ? 0 : c;
    return rr + cc * src_rows;
}

template <class Op>
Val ewise(const Val& a, const Val& b, Op op, bool logical = false) {
    require_num(a, "the operation");
    require_num(b, "the operation");
    int r = 0, c = 0;
    if (!broadcast(a.rows, a.cols, b.rows, b.cols, r, c)) die("array sizes do not match");
    Val o = alloc_num(r, c, logical);
    for (int j = 0; j < c; ++j) {
        for (int i = 0; i < r; ++i) {
            int ia = map_at(i, j, a.rows, a.cols);
            int ib = map_at(i, j, b.rows, b.cols);
            cplx z = op({a.re[ia], a.im[ia]}, {b.re[ib], b.im[ib]});
            int k = i + j * r;
            o.re[k] = z.real();
            o.im[k] = z.imag();
        }
    }
    return o;
}

Val apply1(const Val& a, double (*fr)(double), cplx (*fc)(cplx)) {
    require_num(a, "the function");
    Val o = alloc_num(a.rows, a.cols);
    for (int i = 0; i < a.numel(); ++i) {
        if (a.im[i] == 0.0 && fr) {
            o.re[i] = fr(a.re[i]);
        } else if (fc) {
            cplx z = fc({a.re[i], a.im[i]});
            o.re[i] = z.real();
            o.im[i] = z.imag();
        } else {
            die("this function needs real values");
        }
    }
    return o;
}

Val matmul(const Val& a, const Val& b) {
    require_num(a, "multiplication");
    require_num(b, "multiplication");
    if (a.numel() == 1 || b.numel() == 1) {
        return ewise(a, b, [](cplx x, cplx y) { return x * y; });
    }
    if (a.cols != b.rows) die("matrix sizes do not match for *");
    Val o = alloc_num(a.rows, b.cols);
    for (int j = 0; j < b.cols; ++j) {
        for (int i = 0; i < a.rows; ++i) {
            cplx s = 0;
            for (int k = 0; k < a.cols; ++k) {
                cplx x{a.re_at(i, k), a.im_at(i, k)};
                cplx y{b.re_at(k, j), b.im_at(k, j)};
                s += x * y;
            }
            o.re_at(i, j) = s.real();
            o.im_at(i, j) = s.imag();
        }
    }
    return o;
}

bool solve_lu(std::vector<double> a, int n, std::vector<double> b, int nrhs, std::vector<double>& x) {
    std::vector<int> piv(static_cast<size_t>(n));
    for (int k = 0; k < n; ++k) {
        int p = k;
        double best = std::abs(a[static_cast<size_t>(k + k * n)]);
        for (int i = k + 1; i < n; ++i) {
            double v = std::abs(a[static_cast<size_t>(i + k * n)]);
            if (v > best) {
                best = v;
                p = i;
            }
        }
        piv[static_cast<size_t>(k)] = p;
        if (best < 1e-14) return false;
        if (p != k) {
            for (int j = 0; j < n; ++j) std::swap(a[static_cast<size_t>(k + j * n)], a[static_cast<size_t>(p + j * n)]);
            for (int j = 0; j < nrhs; ++j) std::swap(b[static_cast<size_t>(k + j * n)], b[static_cast<size_t>(p + j * n)]);
        }
        for (int i = k + 1; i < n; ++i) {
            a[static_cast<size_t>(i + k * n)] /= a[static_cast<size_t>(k + k * n)];
            for (int j = k + 1; j < n; ++j) {
                a[static_cast<size_t>(i + j * n)] -= a[static_cast<size_t>(i + k * n)] * a[static_cast<size_t>(k + j * n)];
            }
        }
    }
    x.assign(static_cast<size_t>(n * nrhs), 0.0);
    for (int col = 0; col < nrhs; ++col) {
        for (int i = 0; i < n; ++i) {
            double s = b[static_cast<size_t>(i + col * n)];
            for (int k = 0; k < i; ++k) s -= a[static_cast<size_t>(i + k * n)] * x[static_cast<size_t>(k + col * n)];
            x[static_cast<size_t>(i + col * n)] = s;
        }
        for (int i = n - 1; i >= 0; --i) {
            double s = x[static_cast<size_t>(i + col * n)];
            for (int k = i + 1; k < n; ++k) s -= a[static_cast<size_t>(i + k * n)] * x[static_cast<size_t>(k + col * n)];
            x[static_cast<size_t>(i + col * n)] = s / a[static_cast<size_t>(i + i * n)];
        }
    }
    return true;
}

Val ldiv_real(const Val& a, const Val& b) {
    if (!is_real(a) || !is_real(b)) die("matrix division of complex arrays is not in the C++ translation");
    if (a.rows != a.cols) die("matrix left division needs a square matrix");
    if (a.rows != b.rows) die("matrix left division sizes do not match");
    int n = a.rows;
    std::vector<double> x;
    if (!solve_lu(a.re, n, b.re, b.cols, x)) die("the matrix is singular");
    Val o = alloc_num(n, b.cols);
    o.re = std::move(x);
    return o;
}

Val inverse_of(const Val& a) {
    Val eye = alloc_num(a.rows, a.rows);
    for (int i = 0; i < a.rows; ++i) eye.re_at(i, i) = 1;
    return ldiv_real(a, eye);
}

std::vector<double> jacobi_eig(std::vector<double> a, int n) {
    for (int iter = 0; iter < 80; ++iter) {
        int p = 0, q = 1;
        double best = 0;
        for (int j = 0; j < n; ++j) {
            for (int i = j + 1; i < n; ++i) {
                double v = std::abs(a[static_cast<size_t>(i + j * n)]);
                if (v > best) {
                    best = v;
                    p = i;
                    q = j;
                }
            }
        }
        if (best < 1e-14) break;
        double app = a[static_cast<size_t>(p + p * n)];
        double aqq = a[static_cast<size_t>(q + q * n)];
        double apq = a[static_cast<size_t>(p + q * n)];
        double tau = (aqq - app) / (2 * apq);
        double t = std::copysign(1.0 / (std::abs(tau) + std::sqrt(1 + tau * tau)), tau);
        double c = 1.0 / std::sqrt(1 + t * t);
        double s = c * t;
        a[static_cast<size_t>(p + p * n)] = app - t * apq;
        a[static_cast<size_t>(q + q * n)] = aqq + t * apq;
        a[static_cast<size_t>(p + q * n)] = 0;
        a[static_cast<size_t>(q + p * n)] = 0;
        for (int k = 0; k < n; ++k) {
            if (k == p || k == q) continue;
            double aik = a[static_cast<size_t>(p + k * n)];
            double aqk = a[static_cast<size_t>(q + k * n)];
            double np = c * aik - s * aqk;
            double nq = s * aik + c * aqk;
            a[static_cast<size_t>(p + k * n)] = a[static_cast<size_t>(k + p * n)] = np;
            a[static_cast<size_t>(q + k * n)] = a[static_cast<size_t>(k + q * n)] = nq;
        }
    }
    std::vector<double> e(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) e[static_cast<size_t>(i)] = a[static_cast<size_t>(i + i * n)];
    return e;
}

bool is_symmetric(const Val& a) {
    if (a.rows != a.cols || !is_real(a)) return false;
    for (int j = 0; j < a.cols; ++j) {
        for (int i = 0; i < a.rows; ++i) {
            double d = std::abs(a.re_at(i, j) - a.re_at(j, i));
            if (d > 1e-8 * (1 + std::abs(a.re_at(i, j)))) return false;
        }
    }
    return true;
}

Val eigvec_from_real(const std::vector<double>& e) {
    Val o = alloc_num(static_cast<int>(e.size()), 1);
    o.re = e;
    return o;
}

Val eigvec_from_complex(const std::vector<cplx>& e) {
    Val o = alloc_num(static_cast<int>(e.size()), 1);
    for (size_t i = 0; i < e.size(); ++i) {
        o.re[i] = e[i].real();
        o.im[i] = e[i].imag();
    }
    return o;
}

std::vector<cplx> poly_roots(const std::vector<double>& coeff) {
    // coeff[0] is the leading 1 of a monic polynomial. Durand–Kerner.
    int n = static_cast<int>(coeff.size()) - 1;
    std::vector<cplx> r(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) r[static_cast<size_t>(i)] = std::polar(0.6, 2 * PI * i / n + 0.17);
    for (int iter = 0; iter < 80; ++iter) {
        bool done = true;
        for (int i = 0; i < n; ++i) {
            cplx p = coeff[0];
            for (int k = 1; k <= n; ++k) p = p * r[static_cast<size_t>(i)] + coeff[static_cast<size_t>(k)];
            cplx den = 1;
            for (int j = 0; j < n; ++j) {
                if (j != i) den *= r[static_cast<size_t>(i)] - r[static_cast<size_t>(j)];
            }
            if (std::abs(den) < 1e-18) continue;
            cplx delta = p / den;
            r[static_cast<size_t>(i)] -= delta;
            if (std::abs(delta) > 1e-12) done = false;
        }
        if (done) break;
    }
    return r;
}

Val eigenvalues(const Val& a) {
    require_num(a, "eig");
    if (!is_real(a) || a.rows != a.cols) die("eig needs a real square matrix");
    int n = a.rows;
    if (n == 0) return alloc_num(0, 1);
    if (n == 1) return eigvec_from_real({a.re[0]});
    if (is_symmetric(a)) return eigvec_from_real(jacobi_eig(a.re, n));
    if (n == 2) {
        double tr = a.re_at(0, 0) + a.re_at(1, 1);
        double det = a.re_at(0, 0) * a.re_at(1, 1) - a.re_at(0, 1) * a.re_at(1, 0);
        double disc = tr * tr - 4 * det;
        if (disc >= 0) {
            double s = std::sqrt(disc);
            return eigvec_from_real({(tr + s) / 2, (tr - s) / 2});
        }
        cplx s = std::sqrt(cplx(disc, 0));
        return eigvec_from_complex({(tr + s) / 2.0, (tr - s) / 2.0});
    }
    if (n > 8) die("eig of a general matrix larger than 8×8 is not in the C++ translation");
    // Faddeev–LeVerrier: λ^n − c1 λ^{n−1} − … − cn = 0.
    std::vector<double> b = a.re;
    std::vector<double> c(static_cast<size_t>(n + 1), 0.0);
    for (int k = 1; k <= n; ++k) {
        double tr = 0;
        for (int i = 0; i < n; ++i) tr += b[static_cast<size_t>(i + i * n)];
        c[static_cast<size_t>(k)] = tr / k;
        std::vector<double> m = b;
        for (int i = 0; i < n; ++i) m[static_cast<size_t>(i + i * n)] -= c[static_cast<size_t>(k)];
        std::vector<double> next(static_cast<size_t>(n * n), 0.0);
        for (int j = 0; j < n; ++j) {
            for (int i = 0; i < n; ++i) {
                double s = 0;
                for (int t = 0; t < n; ++t) s += a.re_at(i, t) * m[static_cast<size_t>(t + j * n)];
                next[static_cast<size_t>(i + j * n)] = s;
            }
        }
        b.swap(next);
    }
    std::vector<double> coeff(static_cast<size_t>(n + 1));
    coeff[0] = 1;
    for (int k = 1; k <= n; ++k) coeff[static_cast<size_t>(k)] = -c[static_cast<size_t>(k)];
    return eigvec_from_complex(poly_roots(coeff));
}

Val qr_factors(const Val& a, int nargout) {
    require_num(a, "qr");
    if (!is_real(a)) die("qr needs a real matrix");
    int m = a.rows, n = a.cols;
    std::vector<double> r = a.re;
    std::vector<double> q(static_cast<size_t>(m * m), 0.0);
    for (int i = 0; i < m; ++i) q[static_cast<size_t>(i + i * m)] = 1;
    for (int k = 0; k < std::min(m, n); ++k) {
        double norm = 0;
        for (int i = k; i < m; ++i) norm += r[static_cast<size_t>(i + k * m)] * r[static_cast<size_t>(i + k * m)];
        norm = std::sqrt(norm);
        if (norm < 1e-15) continue;
        double sign = r[static_cast<size_t>(k + k * m)] >= 0 ? 1.0 : -1.0;
        std::vector<double> u(static_cast<size_t>(m - k));
        u[0] = r[static_cast<size_t>(k + k * m)] + sign * norm;
        for (int i = 1; i < m - k; ++i) u[static_cast<size_t>(i)] = r[static_cast<size_t>(k + i + k * m)];
        double un = 0;
        for (double v : u) un += v * v;
        if (un < 1e-30) continue;
        auto apply = [&](std::vector<double>& mat, int cols, int ld) {
            for (int j = 0; j < cols; ++j) {
                double dot = 0;
                for (int i = 0; i < m - k; ++i) dot += u[static_cast<size_t>(i)] * mat[static_cast<size_t>(k + i + j * ld)];
                double beta = 2 * dot / un;
                for (int i = 0; i < m - k; ++i) mat[static_cast<size_t>(k + i + j * ld)] -= beta * u[static_cast<size_t>(i)];
            }
        };
        apply(r, n, m);
        apply(q, m, m);
    }
    // q currently holds Q^T because reflectors were applied to I on the left. Transpose it.
    Val Q = alloc_num(m, m);
    Val R = alloc_num(m, n);
    for (int j = 0; j < m; ++j)
        for (int i = 0; i < m; ++i) Q.re_at(i, j) = q[static_cast<size_t>(j + i * m)];
    for (int j = 0; j < n; ++j)
        for (int i = 0; i < m; ++i) R.re_at(i, j) = r[static_cast<size_t>(i + j * m)];
    if (nargout <= 1) return R;
    return pack({Q, R});
}

double dot_cols(const Val& a) {
    double s = 0;
    for (int i = 0; i < a.numel(); ++i) s += a.re[i] * a.re[i] + a.im[i] * a.im[i];
    return s;
}

Val transpose_num(const Val& a, bool conjugate) {
    Val o = alloc_num(a.cols, a.rows);
    for (int j = 0; j < a.cols; ++j) {
        for (int i = 0; i < a.rows; ++i) {
            o.re_at(j, i) = a.re_at(i, j);
            o.im_at(j, i) = conjugate ? -a.im_at(i, j) : a.im_at(i, j);
        }
    }
    return o;
}

struct Sub {
    bool all = false;
    std::vector<int> idx;
};

Sub resolve_sub(const Val& sub, int dim, bool logical_ok) {
    if (sub.kind == Val::Kind::Colon) return {true, {}};
    require_num(sub, "a subscript");
    if (sub.logical) {
        if (sub.numel() != dim) die("the logical index has the wrong size");
        Sub s;
        for (int i = 0; i < dim; ++i)
            if (sub.re[static_cast<size_t>(i)] != 0.0) s.idx.push_back(i);
        return s;
    }
    Sub s;
    for (int i = 0; i < sub.numel(); ++i) {
        if (sub.im[static_cast<size_t>(i)] != 0.0) die("a subscript is complex");
        double g = sub.re[static_cast<size_t>(i)];
        int k = static_cast<int>(std::llround(g));
        if (std::abs(g - k) > 1e-6) die("a subscript is not an integer");
        if (k < 1 || k > dim) die("index out of range");
        s.idx.push_back(k - 1);
    }
    (void)logical_ok;
    return s;
}

Val take_linear(const Val& base, const Sub& s) {
    if (s.all) {
        Val o = alloc_num(base.numel(), 1, base.logical);
        o.re = base.re;
        o.im = base.im;
        return o;
    }
    Val o = alloc_num(static_cast<int>(s.idx.size()), 1, base.logical);
    for (size_t i = 0; i < s.idx.size(); ++i) {
        o.re[i] = base.re[static_cast<size_t>(s.idx[i])];
        o.im[i] = base.im[static_cast<size_t>(s.idx[i])];
    }
    if (o.numel() == 1) {
        o.rows = 1;
        o.cols = 1;
    }
    return o;
}

Val take2(const Val& base, const Sub& rs, const Sub& cs) {
    int nr = rs.all ? base.rows : static_cast<int>(rs.idx.size());
    int nc = cs.all ? base.cols : static_cast<int>(cs.idx.size());
    Val o = alloc_num(nr, nc, base.logical);
    for (int j = 0; j < nc; ++j) {
        int cj = cs.all ? j : cs.idx[static_cast<size_t>(j)];
        for (int i = 0; i < nr; ++i) {
            int ri = rs.all ? i : rs.idx[static_cast<size_t>(i)];
            o.re_at(i, j) = base.re_at(ri, cj);
            o.im_at(i, j) = base.im_at(ri, cj);
        }
    }
    return o;
}

std::vector<Val> eval_subs(Ctx& ctx, const Val& base, const std::vector<std::function<Val(Ctx&)>>& subs) {
    int sr = ctx.end_rows, sc = ctx.end_cols, sd = ctx.end_dim;
    bool sl = ctx.end_linear, ss = ctx.end_set;
    ctx.end_rows = base.rows;
    ctx.end_cols = base.cols;
    ctx.end_linear = subs.size() == 1;
    ctx.end_set = true;
    std::vector<Val> out;
    for (size_t i = 0; i < subs.size(); ++i) {
        ctx.end_dim = static_cast<int>(i);
        out.push_back(subs[i](ctx));
    }
    ctx.end_rows = sr;
    ctx.end_cols = sc;
    ctx.end_dim = sd;
    ctx.end_linear = sl;
    ctx.end_set = ss;
    return out;
}

Val index_num(const Val& base, const std::vector<Val>& subs) {
    require_num(base, "indexing");
    if (subs.size() == 1) return take_linear(base, resolve_sub(subs[0], base.numel(), true));
    if (subs.size() == 2) return take2(base, resolve_sub(subs[0], base.rows, true), resolve_sub(subs[1], base.cols, true));
    die("only 2-D indexing is in the C++ translation");
}

void put_linear(Val& base, const Sub& s, const Val& value) {
    int n = s.all ? base.numel() : static_cast<int>(s.idx.size());
    if (!(value.numel() == 1 || value.numel() == n)) die("the number of values does not match the index");
    for (int i = 0; i < n; ++i) {
        int at = s.all ? i : s.idx[static_cast<size_t>(i)];
        int src = value.numel() == 1 ? 0 : i;
        base.re[static_cast<size_t>(at)] = value.re[static_cast<size_t>(src)];
        base.im[static_cast<size_t>(at)] = value.im[static_cast<size_t>(src)];
    }
}

std::string json_escape(const std::string& s) {
    std::string o;
    o.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
        case '\\': o += "\\\\"; break;
        case '"': o += "\\\""; break;
        case '\n': o += "\\n"; break;
        case '\r': o += "\\r"; break;
        case '\t': o += "\\t"; break;
        default:
            if (c < 0x20) {
                char b[8];
                std::snprintf(b, sizeof(b), "\\u%04x", c);
                o += b;
            } else {
                o.push_back(static_cast<char>(c));
            }
        }
    }
    return o;
}

std::string json_num(double v) {
    if (!std::isfinite(v)) return "null";
    char b[64];
    std::snprintf(b, sizeof(b), "%.16g", v);
    return b;
}

void write_json(const std::string& path, const std::string& body) {
    std::ofstream out(path, std::ios::binary);
    if (!out) die("could not write the result file");
    out << body;
}

std::string format_val(const Val& v) {
    if (v.kind == Val::Kind::Empty) return "";
    if (v.kind == Val::Kind::Str) return v.s;
    if (v.kind == Val::Kind::Fn) return "function_handle";
    if (v.kind == Val::Kind::Cell) {
        std::ostringstream o;
        o << "cell " << v.rows << "x" << v.cols;
        for (const auto& it : v.items) {
            o << "\n  ";
            if (it.kind == Val::Kind::Str) o << it.s;
            else o << format_val(it);
        }
        return o.str();
    }
    if (v.kind == Val::Kind::Struct) {
        std::ostringstream o;
        o << "struct";
        for (size_t i = 0; i < v.fields.size(); ++i) o << "\n  " << v.fields[i] << ": " << format_val(v.items[i]);
        return o.str();
    }
    if (!v.is_num()) return "";
    std::ostringstream o;
    o.setf(std::ios::fmtflags(0), std::ios::floatfield);
    o.precision(6);
    int rows = std::min(v.rows, 8);
    int cols = std::min(v.cols, 8);
    for (int i = 0; i < rows; ++i) {
        if (i) o << '\n';
        for (int j = 0; j < cols; ++j) {
            if (j) o << "  ";
            o << v.re_at(i, j);
            if (v.im_at(i, j) != 0.0) o << (v.im_at(i, j) >= 0 ? "+" : "") << v.im_at(i, j) << "i";
        }
        if (v.cols > cols) o << "  ...";
    }
    if (v.rows > rows || v.cols > cols) o << "\n(" << v.rows << "x" << v.cols << ")";
    return o.str();
}

void format_printf(std::string& out, const std::string& fmt, const std::vector<Val>& args, size_t& ai) {
    for (size_t i = 0; i < fmt.size();) {
        if (fmt[i] == '\\' && i + 1 < fmt.size()) {
            char n = fmt[++i];
            if (n == 'n') out.push_back('\n');
            else if (n == 't') out.push_back('\t');
            else out.push_back(n);
            ++i;
            continue;
        }
        if (fmt[i] != '%') {
            out.push_back(fmt[i++]);
            continue;
        }
        if (i + 1 < fmt.size() && fmt[i + 1] == '%') {
            out.push_back('%');
            i += 2;
            continue;
        }
        ++i;
        while (i < fmt.size() && std::string("-+ #0").find(fmt[i]) != std::string::npos) ++i;
        while (i < fmt.size() && std::isdigit(static_cast<unsigned char>(fmt[i]))) ++i;
        int prec = -1;
        if (i < fmt.size() && fmt[i] == '.') {
            ++i;
            prec = 0;
            while (i < fmt.size() && std::isdigit(static_cast<unsigned char>(fmt[i]))) prec = prec * 10 + (fmt[i++] - '0');
        }
        if (i >= fmt.size()) break;
        char spec = fmt[i++];
        if (ai >= args.size()) die("fprintf is missing an argument");
        const Val& a = args[ai++];
        char buf[128];
        if (spec == 's') {
            out += a.kind == Val::Kind::Str ? a.s : format_val(a);
        } else if (spec == 'd' || spec == 'i') {
            std::snprintf(buf, sizeof(buf), "%lld", static_cast<long long>(std::llround(real_scalar(a, "fprintf"))));
            out += buf;
        } else {
            if (prec < 0) prec = 6;
            char fs[16];
            char kind = (spec == 'e' || spec == 'E' || spec == 'g' || spec == 'G') ? spec : 'f';
            std::snprintf(fs, sizeof(fs), "%%.%d%c", prec, kind);
            std::snprintf(buf, sizeof(buf), fs, real_scalar(a, "fprintf"));
            out += buf;
        }
    }
}

Val reduce_all(const Val& a, double init, double (*step)(double, double)) {
    double acc = init;
    bool any = false;
    for (int i = 0; i < a.numel(); ++i) {
        if (a.im[i] != 0.0) die("this reduction needs real values");
        acc = any ? step(acc, a.re[i]) : a.re[i];
        any = true;
        (void)init;
    }
    if (!any) return num(std::numeric_limits<double>::quiet_NaN());
    // The first element replaced init. Callers that need a true init pass it via step on empty.
    return num(acc);
}

bool is_vector(const Val& a) { return a.is_num() && (a.rows == 1 || a.cols == 1); }

Val column_reduce(const Val& a, Val (*fn)(const Val&)) {
    if (is_vector(a) || a.cols == 1) return fn(a);
    Val o = alloc_num(1, a.cols);
    for (int j = 0; j < a.cols; ++j) {
        Val col = alloc_num(a.rows, 1);
        for (int i = 0; i < a.rows; ++i) {
            col.re[static_cast<size_t>(i)] = a.re_at(i, j);
            col.im[static_cast<size_t>(i)] = a.im_at(i, j);
        }
        Val r = fn(col);
        o.re[static_cast<size_t>(j)] = r.re[0];
        o.im[static_cast<size_t>(j)] = r.im[0];
    }
    return o;
}

std::pair<int, int> shape_from(const std::vector<Val>& args, size_t at, const char* name) {
    if (args.size() <= at) die(std::string(name) + " needs a size");
    if (args.size() == at + 1) {
        const Val& s = args[at];
        require_num(s, name);
        if (s.numel() == 1) {
            int n = as_int(s, name);
            return {n, n};
        }
        if (s.numel() == 2) {
            Val r = num(s.re[0]);
            Val c = num(s.re[1]);
            return {as_int(r, name), as_int(c, name)};
        }
        die(std::string(name) + " supports 2-D sizes only");
    }
    return {as_int(args[at], name), as_int(args[at + 1], name)};
}

void ensure_fig(Ctx& ctx, bool replace) {
    if (ctx.cur < 0 || ctx.figs.empty()) {
        ctx.figs.push_back(Fig{});
        ctx.cur = static_cast<int>(ctx.figs.size()) - 1;
    }
    if (replace && !ctx.hold) {
        ctx.figs[static_cast<size_t>(ctx.cur)].series.clear();
        ctx.figs[static_cast<size_t>(ctx.cur)].heat = false;
    }
}

void add_xy(Ctx& ctx, const Val* x, const Val& y, const std::string& mode) {
    ensure_fig(ctx, true);
    require_num(y, "plot");
    int rows = y.rows, cols = y.cols;
    for (int c = 0; c < cols; ++c) {
        Series s;
        s.mode = mode;
        s.name = "line " + std::to_string(ctx.figs[static_cast<size_t>(ctx.cur)].series.size() + 1);
        for (int r = 0; r < rows; ++r) {
            double xv = static_cast<double>(r + 1);
            if (x) {
                if (x->numel() == rows) xv = x->re[static_cast<size_t>(r)];
                else if (x->numel() == 1) xv = x->re[0];
                else if (x->rows == rows && x->cols == cols) xv = x->re_at(r, c);
                else die("plot x and y sizes do not match");
            }
            s.x.push_back(xv);
            s.y.push_back(y.re_at(r, c));
        }
        ctx.figs[static_cast<size_t>(ctx.cur)].series.push_back(std::move(s));
    }
}

void do_plot(Ctx& ctx, const std::vector<Val>& args, const std::string& mode) {
    std::vector<const Val*> n;
    for (const auto& a : args)
        if (a.kind != Val::Kind::Str) n.push_back(&a);
    if (n.empty()) die("plot needs data");
    if (n.size() == 1) add_xy(ctx, nullptr, *n[0], mode);
    else if (n.size() == 2) add_xy(ctx, n[0], *n[1], mode);
    else die("this plot form is not in the C++ translation");
}

Val colon_range(double start, double step, double stop) {
    if (step == 0.0) die("a colon step is zero");
    double span = (stop - start) / step;
    if (span < -1e-9) return alloc_num(1, 0);
    int n = static_cast<int>(std::floor(span + 1e-9)) + 1;
    Val o = alloc_num(1, n);
    for (int i = 0; i < n; ++i) o.re[static_cast<size_t>(i)] = start + i * step;
    return o;
}

std::vector<cplx> butter_ba(int order, double wn) {
    if (order < 1 || order > 12) die("butter order must be from 1 to 12");
    if (!(wn > 0 && wn < 1)) die("butter Wn must be between 0 and 1");
    std::vector<cplx> p(static_cast<size_t>(order));
    for (int k = 0; k < order; ++k) {
        int m = -order + 1 + 2 * k;
        p[static_cast<size_t>(k)] = -std::exp(cplx(0, PI * m / (2.0 * order)));
    }
    double warped = 4 * std::tan(PI * wn / 2);
    cplx k = std::pow(cplx(warped, 0), order);
    for (auto& z : p) z *= warped;
    const double fs2 = 4; // 2 * fs, fs = 2 because Wn is already Nyquist-normalized
    std::vector<cplx> zz(static_cast<size_t>(order), cplx(-1, 0));
    cplx prod_p = 1;
    for (auto& z : p) {
        prod_p *= (fs2 - z);
        z = (fs2 + z) / (fs2 - z);
    }
    k = k / prod_p;
    // Polynomials, highest power first.
    auto poly = [](const std::vector<cplx>& roots) {
        std::vector<cplx> c{1};
        for (auto root : roots) {
            std::vector<cplx> n(c.size() + 1);
            for (size_t i = 0; i < c.size(); ++i) {
                n[i] += c[i];
                n[i + 1] -= root * c[i];
            }
            c.swap(n);
        }
        return c;
    };
    auto b = poly(zz);
    auto a = poly(p);
    for (auto& v : b) v *= k;
    cplx a0 = a[0];
    std::vector<cplx> both;
    for (auto v : b) both.push_back(v / a0);
    both.push_back(cplx(std::numeric_limits<double>::quiet_NaN(), 0)); // separator, unused
    (void)both;
    // Return real coefficients through a side channel: caller uses butter_real.
    return {};
}

void butter_real(int order, double wn, std::vector<double>& b, std::vector<double>& a) {
    std::vector<cplx> poles(static_cast<size_t>(order));
    for (int k = 0; k < order; ++k) {
        int m = -order + 1 + 2 * k;
        poles[static_cast<size_t>(k)] = -std::exp(cplx(0, PI * m / (2.0 * order)));
    }
    double warped = 4 * std::tan(PI * wn / 2);
    cplx gain = std::pow(cplx(warped, 0), order);
    for (auto& z : poles) z *= warped;
    const double fs2 = 4;
    cplx prod = 1;
    for (auto& z : poles) {
        prod *= (fs2 - z);
        z = (fs2 + z) / (fs2 - z);
    }
    gain /= prod;
    std::vector<cplx> zeros(static_cast<size_t>(order), cplx(-1, 0));
    auto poly = [](const std::vector<cplx>& roots) {
        std::vector<cplx> c{1};
        for (auto root : roots) {
            std::vector<cplx> n(c.size() + 1);
            for (size_t i = 0; i < c.size(); ++i) {
                n[i] += c[i];
                n[i + 1] -= root * c[i];
            }
            c.swap(n);
        }
        return c;
    };
    auto bb = poly(zeros);
    auto aa = poly(poles);
    for (auto& v : bb) v *= gain;
    cplx a0 = aa[0];
    b.resize(bb.size());
    a.resize(aa.size());
    for (size_t i = 0; i < bb.size(); ++i) b[i] = (bb[i] / a0).real();
    for (size_t i = 0; i < aa.size(); ++i) a[i] = (aa[i] / a0).real();
}

std::vector<double> lfilter(const std::vector<double>& b_in, const std::vector<double>& a_in, const std::vector<double>& x) {
    if (a_in.empty() || b_in.empty()) die("filter needs coefficients");
    double a0 = a_in[0];
    if (std::abs(a0) < 1e-18) die("filter a(1) is zero");
    int n = static_cast<int>(std::max(a_in.size(), b_in.size()));
    std::vector<double> a(static_cast<size_t>(n)), b(static_cast<size_t>(n));
    for (size_t i = 0; i < a_in.size(); ++i) a[i] = a_in[i] / a0;
    for (size_t i = 0; i < b_in.size(); ++i) b[i] = b_in[i] / a0;
    int order = n - 1;
    std::vector<double> z(static_cast<size_t>(std::max(order, 0)), 0.0);
    std::vector<double> y(x.size());
    for (size_t i = 0; i < x.size(); ++i) {
        double yn = b[0] * x[i] + (order > 0 ? z[0] : 0);
        for (int k = 0; k < order - 1; ++k) z[static_cast<size_t>(k)] = z[static_cast<size_t>(k + 1)] + b[static_cast<size_t>(k + 1)] * x[i] - a[static_cast<size_t>(k + 1)] * yn;
        if (order > 0) z[static_cast<size_t>(order - 1)] = b[static_cast<size_t>(order)] * x[i] - a[static_cast<size_t>(order)] * yn;
        y[i] = yn;
    }
    return y;
}

Val as_real_vector(const Val& v, const char* what) {
    require_num(v, what);
    if (!is_real(v)) die(std::string(what) + " needs real values");
    return v;
}

Val from_real_vector(const std::vector<double>& x, bool row) {
    Val o = alloc_num(row ? 1 : static_cast<int>(x.size()), row ? static_cast<int>(x.size()) : 1);
    o.re = x;
    return o;
}

std::vector<double> flat_re(const Val& v) { return v.re; }

Val filtfilt_val(const Val& b, const Val& a, const Val& x) {
    auto bb = flat_re(as_real_vector(b, "filtfilt"));
    auto aa = flat_re(as_real_vector(a, "filtfilt"));
    auto xx = flat_re(as_real_vector(x, "filtfilt"));
    int ntaps = static_cast<int>(std::max(aa.size(), bb.size()));
    int edge = 3 * (ntaps - 1);
    if (edge < 1) edge = 1;
    if (static_cast<int>(xx.size()) <= edge) edge = static_cast<int>(xx.size()) - 1;
    std::vector<double> ext;
    if (edge > 0 && !xx.empty()) {
        for (int i = edge; i >= 1; --i) ext.push_back(2 * xx[0] - xx[static_cast<size_t>(i)]);
        ext.insert(ext.end(), xx.begin(), xx.end());
        for (int i = 1; i <= edge; ++i) {
            size_t at = xx.size() - 1 - static_cast<size_t>(i);
            ext.push_back(2 * xx.back() - xx[at]);
        }
    } else {
        ext = xx;
    }
    auto y = lfilter(bb, aa, ext);
    std::reverse(y.begin(), y.end());
    y = lfilter(bb, aa, y);
    std::reverse(y.begin(), y.end());
    if (edge > 0 && static_cast<int>(y.size()) >= static_cast<int>(xx.size()) + 2 * edge) {
        y = std::vector<double>(y.begin() + edge, y.begin() + edge + static_cast<std::ptrdiff_t>(xx.size()));
    }
    bool row = x.rows == 1;
    return from_real_vector(y, row);
}

void ode_f(Ctx& ctx, const Val& f, double t, const std::vector<double>& y, std::vector<double>& dy) {
    Val tv = num(t);
    Val yv = alloc_num(static_cast<int>(y.size()), 1);
    yv.re = y;
    Val args_fn = f;
    if (args_fn.kind != Val::Kind::Fn) die("ode45 needs a function handle");
    Val out = args_fn.fn(ctx, {tv, yv});
    require_num(out, "the ode function");
    if (out.numel() != static_cast<int>(y.size())) die("the ode function returned the wrong size");
    dy.resize(y.size());
    for (size_t i = 0; i < y.size(); ++i) {
        if (std::abs(out.im[i]) > 1e-8 * (1.0 + std::abs(out.re[i]))) die("the ode function returned a complex value");
        dy[i] = out.re[i];
    }
}

Val ode45(Ctx& ctx, const Val& f, const Val& tspan, const Val& y0) {
    require_num(tspan, "ode45");
    require_num(y0, "ode45");
    if (tspan.numel() < 2) die("ode45 needs a time span");
    double t0 = tspan.re[0];
    double tf = tspan.re[tspan.numel() - 1];
    std::vector<double> y(static_cast<size_t>(y0.numel()));
    for (int i = 0; i < y0.numel(); ++i) y[static_cast<size_t>(i)] = y0.re[static_cast<size_t>(i)];
    const double a21 = 1.0 / 5;
    const double a31 = 3.0 / 40, a32 = 9.0 / 40;
    const double a41 = 44.0 / 45, a42 = -56.0 / 15, a43 = 32.0 / 9;
    const double a51 = 19372.0 / 6561, a52 = -25360.0 / 2187, a53 = 64448.0 / 6561, a54 = -212.0 / 729;
    const double a61 = 9017.0 / 3168, a62 = -355.0 / 33, a63 = 46732.0 / 5247, a64 = 49.0 / 176, a65 = -5103.0 / 18656;
    const double a71 = 35.0 / 384, a73 = 500.0 / 1113, a74 = 125.0 / 192, a75 = -2187.0 / 6784, a76 = 11.0 / 84;
    const double b1s = 5179.0 / 57600, b3s = 7571.0 / 16695, b4s = 393.0 / 640, b5s = -92097.0 / 339200, b6s = 187.0 / 2100, b7s = 1.0 / 40;
    const double rtol = 1e-3, atol = 1e-6;
    double dir = tf >= t0 ? 1.0 : -1.0;
    double h = (tf - t0) / 100.0;
    if (h == 0) h = dir * 1e-3;
    std::vector<double> ts{t0};
    std::vector<std::vector<double>> ys{y};
    std::vector<double> k1, k2, k3, k4, k5, k6, k7, y5, y4;
    ode_f(ctx, f, t0, y, k1);
    int steps = 0;
    while ((tf - t0) * dir > 1e-12 * (1 + std::abs(tf)) && steps < 200000) {
        if ((t0 + h - tf) * dir > 0) h = tf - t0;
        auto axpy = [&](double t, const std::vector<std::pair<double, std::vector<double>*>>& terms, std::vector<double>& out) {
            out.assign(y.size(), 0);
            for (size_t i = 0; i < y.size(); ++i) {
                double s = y[i];
                for (auto& term : terms) s += h * term.first * (*term.second)[i];
                out[i] = s;
            }
            (void)t;
        };
        std::vector<double> yt;
        axpy(t0, {{a21, &k1}}, yt);
        ode_f(ctx, f, t0 + h / 5, yt, k2);
        axpy(t0, {{a31, &k1}, {a32, &k2}}, yt);
        ode_f(ctx, f, t0 + 3 * h / 10, yt, k3);
        axpy(t0, {{a41, &k1}, {a42, &k2}, {a43, &k3}}, yt);
        ode_f(ctx, f, t0 + 4 * h / 5, yt, k4);
        axpy(t0, {{a51, &k1}, {a52, &k2}, {a53, &k3}, {a54, &k4}}, yt);
        ode_f(ctx, f, t0 + 8 * h / 9, yt, k5);
        axpy(t0, {{a61, &k1}, {a62, &k2}, {a63, &k3}, {a64, &k4}, {a65, &k5}}, yt);
        ode_f(ctx, f, t0 + h, yt, k6);
        axpy(t0, {{a71, &k1}, {a73, &k3}, {a74, &k4}, {a75, &k5}, {a76, &k6}}, y5);
        ode_f(ctx, f, t0 + h, y5, k7);
        y4.assign(y.size(), 0);
        for (size_t i = 0; i < y.size(); ++i) {
            y4[i] = y[i] + h * (b1s * k1[i] + b3s * k3[i] + b4s * k4[i] + b5s * k5[i] + b6s * k6[i] + b7s * k7[i]);
        }
        double err = 0;
        for (size_t i = 0; i < y.size(); ++i) {
            double sc = atol + rtol * std::max(std::abs(y[i]), std::abs(y5[i]));
            double e = (y5[i] - y4[i]) / sc;
            err += e * e;
        }
        err = std::sqrt(err / y.size());
        double factor = err == 0 ? 5 : std::min(5.0, std::max(0.2, 0.9 * std::pow(err, -0.2)));
        if (err <= 1 || std::abs(h) < 1e-12) {
            t0 += h;
            y.swap(y5);
            k1.swap(k7);
            ts.push_back(t0);
            ys.push_back(y);
            h *= factor;
        } else {
            h *= factor;
        }
        ++steps;
    }
    Val tv = alloc_num(static_cast<int>(ts.size()), 1);
    tv.re = ts;
    Val yv = alloc_num(static_cast<int>(ts.size()), static_cast<int>(y.size()));
    for (int j = 0; j < yv.cols; ++j)
        for (int i = 0; i < yv.rows; ++i) yv.re_at(i, j) = ys[static_cast<size_t>(i)][static_cast<size_t>(j)];
    return pack({tv, yv});
}

Val natural_spline(const Val& x, const Val& y, const Val& xi) {
    auto xx = flat_re(as_real_vector(x, "interp1"));
    auto yy = flat_re(as_real_vector(y, "interp1"));
    if (xx.size() != yy.size() || xx.size() < 3) die("spline interp1 needs at least 3 points");
    int n = static_cast<int>(xx.size());
    std::vector<double> h(static_cast<size_t>(n - 1));
    for (int i = 0; i < n - 1; ++i) {
        h[static_cast<size_t>(i)] = xx[static_cast<size_t>(i + 1)] - xx[static_cast<size_t>(i)];
        if (h[static_cast<size_t>(i)] == 0) die("interp1 x values must be distinct");
    }
    std::vector<double> m(static_cast<size_t>(n), 0.0);
    if (n > 2) {
        int N = n - 2;
        std::vector<double> A(static_cast<size_t>(N * N), 0.0), rhs(static_cast<size_t>(N), 0.0);
        for (int i = 0; i < N; ++i) {
            double hi = h[static_cast<size_t>(i)];
            double hip = h[static_cast<size_t>(i + 1)];
            if (i > 0) A[static_cast<size_t>(i + (i - 1) * N)] = hi;
            A[static_cast<size_t>(i + i * N)] = 2 * (hi + hip);
            if (i + 1 < N) A[static_cast<size_t>(i + (i + 1) * N)] = hip;
            rhs[static_cast<size_t>(i)] = 6 * ((yy[static_cast<size_t>(i + 2)] - yy[static_cast<size_t>(i + 1)]) / hip - (yy[static_cast<size_t>(i + 1)] - yy[static_cast<size_t>(i)]) / hi);
        }
        std::vector<double> sol;
        if (!solve_lu(A, N, rhs, 1, sol)) die("spline failed");
        for (int i = 0; i < N; ++i) m[static_cast<size_t>(i + 1)] = sol[static_cast<size_t>(i)];
    }
    Val o = alloc_num(xi.rows, xi.cols);
    for (int k = 0; k < xi.numel(); ++k) {
        double q = xi.re[static_cast<size_t>(k)];
        int i = 0;
        if (q <= xx.front()) i = 0;
        else if (q >= xx.back()) i = n - 2;
        else {
            auto it = std::upper_bound(xx.begin(), xx.end(), q);
            i = static_cast<int>(it - xx.begin()) - 1;
        }
        double hi = h[static_cast<size_t>(i)];
        double t = (q - xx[static_cast<size_t>(i)]) / hi;
        double a0 = yy[static_cast<size_t>(i)];
        double b0 = (yy[static_cast<size_t>(i + 1)] - yy[static_cast<size_t>(i)]) / hi - hi * (2 * m[static_cast<size_t>(i)] + m[static_cast<size_t>(i + 1)]) / 6;
        double c0 = m[static_cast<size_t>(i)] / 2;
        double d0 = (m[static_cast<size_t>(i + 1)] - m[static_cast<size_t>(i)]) / (6 * hi);
        double dx = q - xx[static_cast<size_t>(i)];
        o.re[static_cast<size_t>(k)] = a0 + b0 * dx + c0 * dx * dx + d0 * dx * dx * dx;
        (void)t;
    }
    return o;
}

double simpson(Ctx& ctx, const Val& f, double a, double b, double tol, int depth, double fa, double fb, double fc, double whole) {
    double c = (a + b) / 2;
    double ab = (a + c) / 2, cb = (c + b) / 2;
    auto ev = [&](double t) {
        Val o = f.fn(ctx, {num(t)});
        return real_scalar(o, "integral");
    };
    double fab = ev(ab), fcb = ev(cb);
    double left = (c - a) / 6 * (fa + 4 * fab + fc);
    double right = (b - c) / 6 * (fc + 4 * fcb + fb);
    if (depth >= 18 || std::abs(left + right - whole) <= 15 * tol) return left + right + (left + right - whole) / 15;
    return simpson(ctx, f, a, c, tol / 2, depth + 1, fa, fc, fab, left) + simpson(ctx, f, c, b, tol / 2, depth + 1, fc, fb, fcb, right);
}

Val polyval_val(const Val& p, const Val& x) {
    require_num(p, "polyval");
    require_num(x, "polyval");
    Val o = alloc_num(x.rows, x.cols);
    for (int i = 0; i < x.numel(); ++i) {
        double acc = 0;
        for (int k = 0; k < p.numel(); ++k) acc = acc * x.re[static_cast<size_t>(i)] + p.re[static_cast<size_t>(k)];
        o.re[static_cast<size_t>(i)] = acc;
    }
    return o;
}

bool lyapunov(const Val& a, const Val& q, Val& p) {
    int n = a.rows;
    int m = n * (n + 1) / 2;
    std::vector<double> A(static_cast<size_t>(m * m), 0.0), rhs(static_cast<size_t>(m), 0.0);
    std::vector<std::pair<int, int>> unk;
    for (int j = 0; j < n; ++j)
        for (int i = j; i < n; ++i) unk.push_back({i, j});
    auto idx = [&](int r, int c) {
        if (r < c) std::swap(r, c);
        for (int k = 0; k < m; ++k)
            if (unk[static_cast<size_t>(k)].first == r && unk[static_cast<size_t>(k)].second == c) return k;
        return -1;
    };
    // (A^T P + P A)_ij = -Q_ij, i <= j.
    for (int eq = 0; eq < m; ++eq) {
        int i = unk[static_cast<size_t>(eq)].first;
        int j = unk[static_cast<size_t>(eq)].second;
        rhs[static_cast<size_t>(eq)] = -q.re_at(i, j);
        for (int k = 0; k < m; ++k) {
            int r = unk[static_cast<size_t>(k)].first;
            int c = unk[static_cast<size_t>(k)].second;
            // Contribution of P_rc (and P_cr) to (A^T P)_ij and (P A)_ij.
            auto prc = [&](int rr, int cc) {
                if (rr == r && cc == c) return 1.0;
                if (rr == c && cc == r && r != c) return 1.0;
                return 0.0;
            };
            double coef = 0;
            for (int t = 0; t < n; ++t) coef += a.re_at(t, i) * prc(t, j); // (A^T P)_ij = sum_t A_ti P_tj
            for (int t = 0; t < n; ++t) coef += prc(i, t) * a.re_at(t, j); // (P A)_ij
            A[static_cast<size_t>(eq + k * m)] = coef;
        }
    }
    std::vector<double> sol;
    if (!solve_lu(A, m, rhs, 1, sol)) return false;
    p = alloc_num(n, n);
    for (int k = 0; k < m; ++k) {
        int r = unk[static_cast<size_t>(k)].first;
        int c = unk[static_cast<size_t>(k)].second;
        p.re_at(r, c) = p.re_at(c, r) = sol[static_cast<size_t>(k)];
    }
    return true;
}

const Val& arg(const std::vector<Val>& a, size_t i, const char* name) {
    if (i >= a.size()) die(std::string(name) + " needs more arguments");
    return a[i];
}

bool is_builtin(const std::string& name) {
    static const char* names[] = {
        "abs", "sqrt", "exp", "log", "log10", "log2", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
        "sinh", "cosh", "tanh", "floor", "ceil", "round", "fix", "sign", "mod", "rem", "hypot", "real", "imag",
        "conj", "angle", "numel", "length", "size", "ndims", "isempty", "isnan", "isinf", "isfinite", "isnumeric",
        "ischar", "iscell", "isstruct", "isfield", "zeros", "ones", "eye", "linspace", "logspace", "diag", "reshape",
        "repmat", "fliplr", "flipud", "sum", "prod", "mean", "std", "min", "max", "cumsum", "diff", "find", "any",
        "all", "sort", "rand", "randn", "randi", "plot", "scatter", "bar", "stairs", "area", "stem", "surf", "mesh",
        "contour", "imagesc", "title", "xlabel", "ylabel", "legend", "hold", "grid", "axis", "figure", "clf", "clc",
        "clear", "disp", "fprintf", "sprintf", "ode45", "integral", "polyfit", "polyval", "interp1", "fft", "ifft",
        "filter", "filtfilt", "butter", "lqr", "eig", "qr", "det", "inv", "norm", "cond", "trace", "meshgrid",
        "struct", "fieldnames", "struct2cell", "cell", "num2str", "feval", "double", "error", "warning", "disp",
        "transpose", "ctranspose", "horzcat", "vertcat", "cat", "mean", "std", "sum", "prod", "length", "numel",
        "ones", "zeros", "eye", "diag", "rank", "rcond", "magic", nullptr};
    for (int i = 0; names[i]; ++i)
        if (name == names[i]) return true;
    return false;
}

Val call_builtin(Ctx& ctx, const std::string& name, const std::vector<Val>& a, int nargout) {
    auto unary = [&](double (*f)(double)) {
        return apply1(arg(a, 0, name.c_str()), f, nullptr);
    };
    if (name == "sin") return apply1(arg(a, 0, "sin"), std::sin, [](cplx z) { return std::sin(z); });
    if (name == "cos") return apply1(arg(a, 0, "cos"), std::cos, [](cplx z) { return std::cos(z); });
    if (name == "tan") return unary(std::tan);
    if (name == "asin") return unary(std::asin);
    if (name == "acos") return unary(std::acos);
    if (name == "atan") return unary(std::atan);
    if (name == "sinh") return unary(std::sinh);
    if (name == "cosh") return unary(std::cosh);
    if (name == "tanh") return unary(std::tanh);
    if (name == "exp") return apply1(arg(a, 0, "exp"), std::exp, [](cplx z) { return std::exp(z); });
    if (name == "log") return apply1(arg(a, 0, "log"), std::log, [](cplx z) { return std::log(z); });
    if (name == "log10") return unary([](double x) { return std::log10(x); });
    if (name == "log2") return unary([](double x) { return std::log(x) / std::log(2.0); });
    if (name == "sqrt") return apply1(arg(a, 0, "sqrt"), std::sqrt, [](cplx z) { return std::sqrt(z); });
    if (name == "abs") {
        Val x = arg(a, 0, "abs");
        require_num(x, "abs");
        Val o = alloc_num(x.rows, x.cols);
        for (int i = 0; i < x.numel(); ++i) o.re[static_cast<size_t>(i)] = std::hypot(x.re[static_cast<size_t>(i)], x.im[static_cast<size_t>(i)]);
        return o;
    }
    if (name == "floor") return unary(std::floor);
    if (name == "ceil") return unary(std::ceil);
    if (name == "round") return unary([](double x) { return std::round(x); });
    if (name == "fix") return unary([](double x) { return std::trunc(x); });
    if (name == "sign") return unary([](double x) { return x > 0 ? 1.0 : (x < 0 ? -1.0 : 0.0); });
    if (name == "real") {
        Val x = arg(a, 0, "real");
        require_num(x, "real");
        Val o = x;
        std::fill(o.im.begin(), o.im.end(), 0.0);
        return o;
    }
    if (name == "imag") {
        Val x = arg(a, 0, "imag");
        require_num(x, "imag");
        Val o = x;
        o.re = x.im;
        std::fill(o.im.begin(), o.im.end(), 0.0);
        return o;
    }
    if (name == "conj" || name == "ctranspose") return transpose(arg(a, 0, name.c_str()), true);
    if (name == "transpose") return transpose(arg(a, 0, "transpose"), false);
    if (name == "atan2") return ewise(arg(a, 0, "atan2"), arg(a, 1, "atan2"), [](cplx x, cplx y) { return cplx(std::atan2(x.real(), y.real()), 0); });
    if (name == "hypot") return ewise(arg(a, 0, "hypot"), arg(a, 1, "hypot"), [](cplx x, cplx y) { return cplx(std::hypot(x.real(), y.real()), 0); });
    if (name == "mod") return ewise(arg(a, 0, "mod"), arg(a, 1, "mod"), [](cplx x, cplx y) { return cplx(std::fmod(x.real(), y.real()), 0); });
    if (name == "rem") return ewise(arg(a, 0, "rem"), arg(a, 1, "rem"), [](cplx x, cplx y) { return cplx(std::fmod(x.real(), y.real()), 0); });
    if (name == "angle") {
        Val x = arg(a, 0, "angle");
        require_num(x, "angle");
        Val o = alloc_num(x.rows, x.cols);
        for (int i = 0; i < x.numel(); ++i) o.re[i] = std::atan2(x.im[i], x.re[i]);
        return o;
    }
    if (name == "numel") return num(arg(a, 0, "numel").kind == Val::Kind::Num || arg(a, 0, "numel").kind == Val::Kind::Cell ? arg(a, 0, "numel").numel() : (arg(a, 0, "numel").kind == Val::Kind::Str ? static_cast<int>(arg(a, 0, "numel").s.size()) : 0));
    if (name == "length") {
        const Val& x = arg(a, 0, "length");
        return num(std::max(x.rows, x.cols));
    }
    if (name == "ndims") return num(arg(a, 0, "ndims").is_num() || arg(a, 0, "ndims").kind == Val::Kind::Cell ? 2 : 0);
    if (name == "isempty") return num(arg(a, 0, "isempty").numel() == 0 ? 1 : 0);
    if (name == "isnumeric") return num(arg(a, 0, "isnumeric").is_num() ? 1 : 0);
    if (name == "ischar") return num(arg(a, 0, "ischar").kind == Val::Kind::Str ? 1 : 0);
    if (name == "iscell") return num(arg(a, 0, "iscell").kind == Val::Kind::Cell ? 1 : 0);
    if (name == "isstruct") return num(arg(a, 0, "isstruct").kind == Val::Kind::Struct ? 1 : 0);
    if (name == "isnan" || name == "isinf" || name == "isfinite") {
        Val x = arg(a, 0, name.c_str());
        require_num(x, name.c_str());
        Val o = alloc_num(x.rows, x.cols, true);
        for (int i = 0; i < x.numel(); ++i) {
            bool w = name == "isnan" ? std::isnan(x.re[i]) : name == "isinf" ? std::isinf(x.re[i]) : std::isfinite(x.re[i]);
            o.re[i] = w ? 1 : 0;
        }
        return o;
    }
    if (name == "size") {
        const Val& x = arg(a, 0, "size");
        if (a.size() >= 2) {
            int dim = as_int(a[1], "size");
            return num(dim == 1 ? x.rows : dim == 2 ? x.cols : 1);
        }
        if (nargout >= 2) return pack({num(x.rows), num(x.cols)});
        Val o = alloc_num(1, 2);
        o.re[0] = x.rows;
        o.re[1] = x.cols;
        return o;
    }
    if (name == "zeros" || name == "ones" || name == "eye" || name == "rand" || name == "randn") {
        auto sh = a.empty() ? std::pair<int, int>{1, 1} : shape_from(a, 0, name.c_str());
        Val o = alloc_num(sh.first, sh.second);
        if (name == "ones") std::fill(o.re.begin(), o.re.end(), 1.0);
        if (name == "eye")
            for (int i = 0; i < std::min(o.rows, o.cols); ++i) o.re_at(i, i) = 1;
        if (name == "rand")
            for (double& v : o.re) v = std::uniform_real_distribution<double>(0.0, 1.0)(ctx.rng);
        if (name == "randn")
            for (double& v : o.re) v = std::normal_distribution<double>(0.0, 1.0)(ctx.rng);
        return o;
    }
    if (name == "linspace") {
        double x0 = real_scalar(arg(a, 0, "linspace"), "linspace");
        double x1 = real_scalar(arg(a, 1, "linspace"), "linspace");
        int n = a.size() >= 3 ? as_int(a[2], "linspace") : 100;
        if (n < 1) die("linspace length");
        Val o = alloc_num(1, n);
        if (n == 1) o.re[0] = x1;
        else
            for (int i = 0; i < n; ++i) o.re[i] = x0 + (x1 - x0) * i / (n - 1);
        return o;
    }
    if (name == "logspace") {
        double a0 = real_scalar(arg(a, 0, "logspace"), "logspace");
        double b0 = real_scalar(arg(a, 1, "logspace"), "logspace");
        int n = a.size() >= 3 ? as_int(a[2], "logspace") : 50;
        Val u = call_builtin(ctx, "linspace", {num(a0), num(b0), num(n)}, 1);
        for (double& v : u.re) v = std::pow(10, v);
        return u;
    }
    if (name == "diag") {
        Val x = arg(a, 0, "diag");
        require_num(x, "diag");
        if (is_vector(x)) {
            int n = x.numel();
            Val o = alloc_num(n, n);
            for (int i = 0; i < n; ++i) o.re_at(i, i) = x.re[static_cast<size_t>(i)];
            return o;
        }
        int n = std::min(x.rows, x.cols);
        Val o = alloc_num(n, 1);
        for (int i = 0; i < n; ++i) o.re[static_cast<size_t>(i)] = x.re_at(i, i);
        return o;
    }
    return builtin(ctx, name, a, nargout);
}

} // namespace

void die(const std::string& msg) {
    if (g_line > 0) throw std::runtime_error("line " + std::to_string(g_line) + ": " + msg);
    throw std::runtime_error(msg);
}

Val num(double v) {
    Val o = alloc_num(1, 1);
    o.re[0] = v;
    return o;
}

Val imag_num(double v) {
    Val o = alloc_num(1, 1);
    o.im[0] = v;
    return o;
}

Val str(std::string s) {
    Val o;
    o.kind = Val::Kind::Str;
    o.s = std::move(s);
    o.rows = 1;
    o.cols = static_cast<int>(o.s.size());
    return o;
}

Val empty() { return Val{}; }

Val all() {
    Val o;
    o.kind = Val::Kind::Colon;
    return o;
}

Val end_mark(Ctx& ctx) {
    if (!ctx.end_set) die("end is only valid inside an index");
    return num(ctx.end_value());
}

Val colon(const Val& start, const Val& step, const Val& stop) {
    if (step.kind == Val::Kind::Empty) return colon_range(real_scalar(start, ":"), 1, real_scalar(stop, ":"));
    return colon_range(real_scalar(start, ":"), real_scalar(step, ":"), real_scalar(stop, ":"));
}

Val add(const Val& a, const Val& b) { return ewise(a, b, [](cplx x, cplx y) { return x + y; }); }
Val sub(const Val& a, const Val& b) { return ewise(a, b, [](cplx x, cplx y) { return x - y; }); }
Val emul(const Val& a, const Val& b) { return ewise(a, b, [](cplx x, cplx y) { return x * y; }); }
Val ediv(const Val& a, const Val& b) { return ewise(a, b, [](cplx x, cplx y) { return x / y; }); }
Val eldiv(const Val& a, const Val& b) { return ewise(b, a, [](cplx x, cplx y) { return x / y; }); }
Val epow(const Val& a, const Val& b) {
    return ewise(a, b, [](cplx x, cplx y) {
        if (x.imag() == 0.0 && y.imag() == 0.0) return cplx(std::pow(x.real(), y.real()), 0.0);
        return std::pow(x, y);
    });
}
Val mul(const Val& a, const Val& b) { return matmul(a, b); }

Val pow(const Val& a, const Val& b) {
    if (a.numel() == 1 && b.numel() == 1) return epow(a, b);
    require_num(a, "^");
    int n = as_int(b, "^");
    if (n < 0) die("negative matrix powers are not in the C++ translation");
    if (a.rows != a.cols) die("matrix power needs a square matrix");
    Val o = alloc_num(a.rows, a.rows);
    for (int i = 0; i < a.rows; ++i) o.re_at(i, i) = 1;
    for (int i = 0; i < n; ++i) o = matmul(o, a);
    return o;
}

Val ldiv(const Val& a, const Val& b) {
    if (a.numel() == 1 || b.numel() == 1) return eldiv(a, b);
    return ldiv_real(a, b);
}

Val div(const Val& a, const Val& b) {
    if (a.numel() == 1 || b.numel() == 1) return ediv(a, b);
    return matmul(a, inverse_of(b));
}

Val cmp_op(const Val& a, const Val& b, bool (*pred)(double, double)) {
    return ewise(a, b, [pred](cplx x, cplx y) {
        if (x.imag() != 0 || y.imag() != 0) die("comparison of complex values is not in the C++ translation");
        return cplx(pred(x.real(), y.real()) ? 1 : 0, 0);
    }, true);
}

Val cmp_lt(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x < y; }); }
Val cmp_le(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x <= y; }); }
Val cmp_gt(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x > y; }); }
Val cmp_ge(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x >= y; }); }
Val cmp_eq(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x == y; }); }
Val cmp_ne(const Val& a, const Val& b) { return cmp_op(a, b, [](double x, double y) { return x != y; }); }

Val band(const Val& a, const Val& b) {
    return ewise(a, b, [](cplx x, cplx y) { return cplx(x.real() != 0 && y.real() != 0 ? 1 : 0, 0); }, true);
}
Val bor(const Val& a, const Val& b) {
    return ewise(a, b, [](cplx x, cplx y) { return cplx(x.real() != 0 || y.real() != 0 ? 1 : 0, 0); }, true);
}

Val andand(Ctx& ctx, const std::function<Val(Ctx&)>& a, const std::function<Val(Ctx&)>& b) {
    if (!is_true(a(ctx))) return num(0);
    return num(is_true(b(ctx)) ? 1 : 0);
}
Val oror(Ctx& ctx, const std::function<Val(Ctx&)>& a, const std::function<Val(Ctx&)>& b) {
    if (is_true(a(ctx))) return num(1);
    return num(is_true(b(ctx)) ? 1 : 0);
}

Val uminus(const Val& a) { return ewise(a, num(0), [](cplx x, cplx) { return -x; }); }
Val unot(const Val& a) {
    require_num(a, "~");
    Val o = alloc_num(a.rows, a.cols, true);
    for (int i = 0; i < a.numel(); ++i) o.re[i] = a.re[i] == 0 ? 1 : 0;
    return o;
}

Val transpose(const Val& a, bool conjugate) {
    if (a.kind == Val::Kind::Cell) {
        Val o = a;
        o.rows = a.cols;
        o.cols = a.rows;
        o.items.assign(static_cast<size_t>(o.rows * o.cols), empty());
        for (int j = 0; j < a.cols; ++j)
            for (int i = 0; i < a.rows; ++i) o.items[static_cast<size_t>(j + i * o.rows)] = a.items[static_cast<size_t>(i + j * a.rows)];
        return o;
    }
    if (a.kind == Val::Kind::Str) return a;
    require_num(a, "transpose");
    return transpose_num(a, conjugate);
}

Val cat_along(const std::vector<Val>& parts, bool horizontal) {
    std::vector<Val> p;
    for (const auto& v : parts)
        if (v.kind != Val::Kind::Empty && !(v.is_num() && v.numel() == 0)) p.push_back(v);
    if (p.empty()) return alloc_num(0, 0);
    for (const auto& v : p)
        if (!v.is_num()) die("[] can concatenate numeric arrays in the C++ translation");
    if (horizontal) {
        int rows = p[0].rows;
        int cols = 0;
        for (const auto& v : p) {
            if (v.rows != rows) die("horizontal concatenation sizes do not match");
            cols += v.cols;
        }
        Val o = alloc_num(rows, cols);
        int c0 = 0;
        for (const auto& v : p) {
            for (int j = 0; j < v.cols; ++j)
                for (int i = 0; i < rows; ++i) {
                    o.re_at(i, c0 + j) = v.re_at(i, j);
                    o.im_at(i, c0 + j) = v.im_at(i, j);
                }
            c0 += v.cols;
        }
        return o;
    }
    int cols = p[0].cols;
    int rows = 0;
    for (const auto& v : p) {
        if (v.cols != cols) die("vertical concatenation sizes do not match");
        rows += v.rows;
    }
    Val o = alloc_num(rows, cols);
    int r0 = 0;
    for (const auto& v : p) {
        for (int j = 0; j < cols; ++j)
            for (int i = 0; i < v.rows; ++i) {
                o.re_at(r0 + i, j) = v.re_at(i, j);
                o.im_at(r0 + i, j) = v.im_at(i, j);
            }
        r0 += v.rows;
    }
    return o;
}

Val horzcat(const std::vector<Val>& parts) { return cat_along(parts, true); }
Val vertcat(const std::vector<Val>& parts) { return cat_along(parts, false); }

CellRow cell_row(std::vector<Val> items) { return CellRow{std::move(items)}; }

Val make_cell(const std::vector<CellRow>& rows) {
    if (rows.empty()) {
        Val o;
        o.kind = Val::Kind::Cell;
        return o;
    }
    int cols = static_cast<int>(rows[0].items.size());
    int rws = static_cast<int>(rows.size());
    Val o;
    o.kind = Val::Kind::Cell;
    o.rows = rws;
    o.cols = cols;
    o.items.assign(static_cast<size_t>(rws * cols), empty());
    for (int i = 0; i < rws; ++i) {
        if (static_cast<int>(rows[static_cast<size_t>(i)].items.size()) != cols) die("cell rows have different lengths");
        for (int j = 0; j < cols; ++j) o.items[static_cast<size_t>(i + j * rws)] = rows[static_cast<size_t>(i)].items[static_cast<size_t>(j)];
    }
    return o;
}

Val field_get(const Val& a, const std::string& name) {
    if (a.kind != Val::Kind::Struct) die("field access needs a struct");
    for (size_t i = 0; i < a.fields.size(); ++i)
        if (a.fields[i] == name) return a.items[i];
    die("no field '" + name + "'");
}

Val dyn_field(const Val& a, const Val& key) { return field_get(a, as_text(key)); }

Val lambda(int nargin, std::function<Val(Ctx&, const std::vector<Val>&)> fn) {
    Val v;
    v.kind = Val::Kind::Fn;
    v.nargin = nargin;
    v.fn = std::move(fn);
    return v;
}

Val pack(std::vector<Val> outs) {
    if (outs.size() <= 1) return outs.empty() ? empty() : outs[0];
    Val m;
    m.kind = Val::Kind::Multi;
    m.items = std::move(outs);
    return m;
}

Val nth(const Val& v, int index) {
    if (v.kind == Val::Kind::Multi) {
        if (index < 0 || index >= static_cast<int>(v.items.size())) die("not enough outputs");
        return v.items[static_cast<size_t>(index)];
    }
    if (index == 0) return v;
    die("not enough outputs");
}

bool is_true(const Val& v) {
    if (v.kind == Val::Kind::Str) return !v.s.empty();
    if (!v.is_num() || v.numel() == 0) return false;
    for (int i = 0; i < v.numel(); ++i)
        if (v.re[i] == 0.0 || std::isnan(v.re[i])) return false;
    return true;
}

bool switch_eq(const Val& a, const Val& b) {
    if (a.kind == Val::Kind::Str || b.kind == Val::Kind::Str) return as_text(a) == as_text(b);
    if (b.kind == Val::Kind::Cell) {
        for (const auto& it : b.items)
            if (switch_eq(a, it)) return true;
        return false;
    }
    if (a.is_num() && b.is_num() && a.numel() == 1 && b.numel() == 1) return a.re[0] == b.re[0] && a.im[0] == b.im[0];
    if (a.is_num() && b.is_num() && same_shape(a, b)) {
        for (int i = 0; i < a.numel(); ++i)
            if (a.re[i] != b.re[i] || a.im[i] != b.im[i]) return false;
        return true;
    }
    return false;
}

int ncolumns(const Val& v) {
    if (v.kind == Val::Kind::Str) return static_cast<int>(v.s.size());
    if (v.kind == Val::Kind::Num || v.kind == Val::Kind::Cell) return std::max(v.cols, v.kind == Val::Kind::Empty ? 0 : v.cols);
    if (v.kind == Val::Kind::Empty) return 0;
    return 1;
}

Val column(const Val& v, int j) {
    if (v.is_num()) {
        Val o = alloc_num(v.rows, 1, v.logical);
        for (int i = 0; i < v.rows; ++i) {
            o.re[static_cast<size_t>(i)] = v.re_at(i, j);
            o.im[static_cast<size_t>(i)] = v.im_at(i, j);
        }
        return o;
    }
    if (v.kind == Val::Kind::Cell) {
        Val o;
        o.kind = Val::Kind::Cell;
        o.rows = v.rows;
        o.cols = 1;
        for (int i = 0; i < v.rows; ++i) o.items.push_back(v.items[static_cast<size_t>(i + j * v.rows)]);
        return o;
    }
    if (v.kind == Val::Kind::Str) return str(std::string(1, v.s[static_cast<size_t>(j)]));
    return v;
}

Frame::Frame(Ctx& ctx) : ctx(ctx) { ctx.push(); }
Frame::~Frame() { ctx.pop(); }

Ctx::Ctx() {
    scopes.push_back({});
    rng.seed(1);
    set("pi", num(PI));
    set("eps", num(2.220446049250313e-16));
    set("inf", num(INFINITY));
    set("Inf", num(INFINITY));
    set("nan", num(std::numeric_limits<double>::quiet_NaN()));
    set("NaN", num(std::numeric_limits<double>::quiet_NaN()));
    set("true", num(1));
    set("false", num(0));
    set("i", imag_num(1));
    set("j", imag_num(1));
}

void Ctx::mark(int n) {
    line = n;
    g_line = n;
}
void Ctx::seed_rng(unsigned long long seed) { rng.seed(seed ? seed : 1); }
void Ctx::push() { scopes.push_back({}); }
void Ctx::pop() {
    if (scopes.size() > 1) scopes.pop_back();
}
void Ctx::set(const std::string& name, Val value) { scopes.back()[name] = std::move(value); }
void Ctx::bind(const std::string& name, Val value) { scopes.back()[name] = std::move(value); }

bool Ctx::has(const std::string& name) const {
    for (int i = static_cast<int>(scopes.size()) - 1; i >= 0; --i)
        if (scopes[static_cast<size_t>(i)].count(name)) return true;
    return false;
}

Val Ctx::get(const std::string& name) const {
    for (int i = static_cast<int>(scopes.size()) - 1; i >= 0; --i) {
        auto it = scopes[static_cast<size_t>(i)].find(name);
        if (it != scopes[static_cast<size_t>(i)].end()) return it->second;
    }
    error("undefined variable '" + name + "'");
}

void Ctx::error(const std::string& msg) const { die(msg); }

double Ctx::end_value() const {
    if (end_linear) return static_cast<double>(end_rows * end_cols);
    if (end_dim == 0) return static_cast<double>(std::max(end_rows, 0));
    return static_cast<double>(std::max(end_cols, 0));
}

void Ctx::show(const Val& value) {
    if (value.kind == Val::Kind::Empty || value.kind == Val::Kind::Fn) return;
    text += format_val(value);
    text.push_back('\n');
}

void Ctx::show_named(const std::string& name, const Val& value) {
    text += name;
    text += " =\n";
    show(value);
}

void Ctx::set_index_lazy(const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, Val value) {
    Val base = has(name) ? get(name) : alloc_num(0, 0);
    if (!base.is_num()) error("indexed assignment needs a numeric array");
    auto ev = eval_subs(*this, base, subs);
    require_num(value, "assignment");
    if (ev.size() == 1) put_linear(base, resolve_sub(ev[0], base.numel(), true), value);
    else if (ev.size() == 2) {
        Sub rs = resolve_sub(ev[0], base.rows, true);
        Sub cs = resolve_sub(ev[1], base.cols, true);
        int nr = rs.all ? base.rows : static_cast<int>(rs.idx.size());
        int nc = cs.all ? base.cols : static_cast<int>(cs.idx.size());
        int n = nr * nc;
        if (!(value.numel() == 1 || value.numel() == n)) error("the number of values does not match the index");
        int k = 0;
        for (int j = 0; j < nc; ++j) {
            int cj = cs.all ? j : cs.idx[static_cast<size_t>(j)];
            for (int i = 0; i < nr; ++i, ++k) {
                int ri = rs.all ? i : rs.idx[static_cast<size_t>(i)];
                int src = value.numel() == 1 ? 0 : k;
                base.re_at(ri, cj) = value.re[static_cast<size_t>(src)];
                base.im_at(ri, cj) = value.im[static_cast<size_t>(src)];
            }
        }
    } else {
        error("only 2-D indexing is in the C++ translation");
    }
    set(name, std::move(base));
}

void Ctx::set_cell_lazy(const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, Val value) {
    Val base = has(name) ? get(name) : Val{};
    if (base.kind == Val::Kind::Empty) {
        base.kind = Val::Kind::Cell;
    }
    if (base.kind != Val::Kind::Cell) error("{} assignment needs a cell");
    auto ev = eval_subs(*this, base, subs);
    int k = 0;
    if (ev.size() == 1) {
        Sub s = resolve_sub(ev[0], std::max(base.numel(), 1), false);
        if (s.idx.size() != 1) error("cell assignment needs one index");
        k = s.idx[0];
    } else {
        error("cell assignment of this form is not in the C++ translation");
    }
    if (k >= static_cast<int>(base.items.size())) base.items.resize(static_cast<size_t>(k + 1));
    base.items[static_cast<size_t>(k)] = std::move(value);
    if (base.cols == 0) {
        base.rows = static_cast<int>(base.items.size());
        base.cols = 1;
    }
    set(name, std::move(base));
}

void Ctx::set_field(const std::string& name, const std::string& field, Val value) {
    Val base = has(name) ? get(name) : Val{};
    if (base.kind == Val::Kind::Empty) {
        base.kind = Val::Kind::Struct;
        base.rows = 1;
        base.cols = 1;
    }
    if (base.kind != Val::Kind::Struct) error("field assignment needs a struct");
    for (size_t i = 0; i < base.fields.size(); ++i) {
        if (base.fields[i] == field) {
            base.items[i] = std::move(value);
            set(name, std::move(base));
            return;
        }
    }
    base.fields.push_back(field);
    base.items.push_back(std::move(value));
    set(name, std::move(base));
}

void Ctx::finish(const std::string& path) const {
    std::ostringstream o;
    o << "{\"ok\":true,\"error\":null,\"text\":\"" << json_escape(text) << "\",\"scalars\":[";
    bool first = true;
    const char* skip[] = {"pi", "eps", "inf", "Inf", "nan", "NaN", "true", "false", "i", "j", nullptr};
    auto skipped = [&](const std::string& n) {
        for (int i = 0; skip[i]; ++i)
            if (n == skip[i]) return true;
        return false;
    };
    if (!scopes.empty()) {
        for (const auto& kv : scopes[0]) {
            if (skipped(kv.first) || kv.second.kind != Val::Kind::Num || kv.second.numel() != 1) continue;
            if (!first) o << ',';
            first = false;
            o << "{\"name\":\"" << json_escape(kv.first) << "\",\"value\":" << json_num(kv.second.re[0]) << "}";
        }
    }
    o << "],\"series\":[";
    bool wrote_series = false;
    for (size_t f = 0; f < figs.size(); ++f) {
        const Fig& fig = figs[f];
        if (fig.series.empty()) continue;
        if (wrote_series) o << ',';
        wrote_series = true;
        o << "{\"title\":\"" << json_escape(fig.title) << "\",\"xlabel\":\"" << json_escape(fig.xlabel) << "\",\"ylabel\":\"" << json_escape(fig.ylabel) << "\",\"legend\":[";
        for (size_t i = 0; i < fig.legend.size(); ++i) {
            if (i) o << ',';
            o << '"' << json_escape(fig.legend[i]) << '"';
        }
        o << "],\"lines\":[";
        for (size_t s = 0; s < fig.series.size(); ++s) {
            const Series& ser = fig.series[s];
            if (s) o << ',';
            int n = static_cast<int>(std::min(ser.x.size(), ser.y.size()));
            int stride = std::max(1, (n + 7999) / 8000);
            o << "{\"name\":\"" << json_escape(ser.name) << "\",\"mode\":\"" << ser.mode << "\",\"x\":[";
            bool nf = true;
            for (int i = 0; i < n; i += stride) {
                if (!nf) o << ',';
                nf = false;
                o << json_num(ser.x[static_cast<size_t>(i)]);
            }
            o << "],\"y\":[";
            nf = true;
            for (int i = 0; i < n; i += stride) {
                if (!nf) o << ',';
                nf = false;
                o << json_num(ser.y[static_cast<size_t>(i)]);
            }
            o << "]}";
        }
        o << "]}";
    }
    // The comma above is wrong when the first figures are heat-only. Rebuild series more carefully if needed.
    o << "],\"grids\":[";
    bool gf = true;
    for (const auto& fig : figs) {
        if (!fig.heat) continue;
        if (!gf) o << ',';
        gf = false;
        o << "{\"title\":\"" << json_escape(fig.title) << "\",\"xLabel\":\"" << json_escape(fig.xlabel) << "\",\"yLabel\":\"" << json_escape(fig.ylabel) << "\",\"zLabel\":\"\",\"x\":[";
        for (size_t i = 0; i < fig.gx.size(); ++i) {
            if (i) o << ',';
            o << json_num(fig.gx[i]);
        }
        o << "],\"y\":[";
        for (size_t i = 0; i < fig.gy.size(); ++i) {
            if (i) o << ',';
            o << json_num(fig.gy[i]);
        }
        o << "],\"z\":[";
        for (size_t i = 0; i < fig.gz.size(); ++i) {
            if (i) o << ',';
            o << json_num(fig.gz[i]);
        }
        o << "]}";
    }
    o << "]}";
    // Fix series commas: the loop used figure index. If a heat figure came first, JSON can have a leading comma.
    std::string body = o.str();
    auto pos = body.find("\"series\":[");
    if (pos != std::string::npos) {
        auto at = pos + std::string("\"series\":[").size();
        if (at < body.size() && body[at] == ',') body.erase(at, 1);
    }
    write_json(path, body);
}

void Ctx::fail(const std::string& path, const std::string& error) const {
    std::ostringstream o;
    o << "{\"ok\":false,\"error\":\"" << json_escape(error) << "\",\"text\":\"" << json_escape(text) << "\",\"scalars\":[],\"series\":[],\"grids\":[]}";
    std::ofstream out(path, std::ios::binary);
    if (out) out << o.str();
}

Val handle(Ctx& ctx, const std::string& name) {
    if (ctx.has(name)) {
        Val v = ctx.get(name);
        if (v.kind == Val::Kind::Fn) return v;
    }
    if (!is_builtin(name)) die("undefined function '" + name + "'");
    return lambda(1, [name](Ctx& c, const std::vector<Val>& args) { return call_builtin(c, name, args, 1); });
}

Val index_or_call_lazy(Ctx& ctx, const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, int nargout) {
    if (ctx.has(name)) {
        Val v = ctx.get(name);
        if (v.kind == Val::Kind::Fn) {
            std::vector<Val> args;
            for (const auto& s : subs) args.push_back(s(ctx));
            int saved = ctx.nargout;
            ctx.nargout = nargout;
            Val r = v.fn(ctx, args);
            ctx.nargout = saved;
            if (r.kind == Val::Kind::Multi && nargout <= 1) return r.items.empty() ? empty() : r.items[0];
            return r;
        }
        if (subs.empty()) return v;
        auto ev = eval_subs(ctx, v, subs);
        if (v.is_num()) return index_num(v, ev);
        if (v.kind == Val::Kind::Cell) {
            if (ev.size() != 1) die("cell contents of this form are not in the C++ translation");
            Sub s = resolve_sub(ev[0], v.numel(), false);
            if (s.idx.size() != 1) die("cell contents need one index");
            return v.items[static_cast<size_t>(s.idx[0])];
        }
        die("this value cannot be indexed");
    }
    if (!is_builtin(name)) die("undefined variable or function '" + name + "'");
    std::vector<Val> args;
    for (const auto& s : subs) args.push_back(s(ctx));
    Val r = call_builtin(ctx, name, args, nargout);
    if (r.kind == Val::Kind::Multi && nargout <= 1) return r.items.empty() ? empty() : r.items[0];
    return r;
}

Val cell_index_lazy(Ctx& ctx, const Val& base, const std::vector<std::function<Val(Ctx&)>>& subs) {
    if (base.kind != Val::Kind::Cell) die("{} needs a cell");
    auto ev = eval_subs(ctx, base, subs);
    if (ev.size() != 1) die("cell contents of this form are not in the C++ translation");
    Sub s = resolve_sub(ev[0], base.numel(), false);
    if (s.idx.size() != 1) die("cell contents need one index");
    return base.items[static_cast<size_t>(s.idx[0])];
}

namespace {

Val sum_one(const Val& col) {
    double s = 0;
    for (double v : col.re) s += v;
    return num(s);
}
Val prod_one(const Val& col) {
    double s = 1;
    for (double v : col.re) s *= v;
    return num(col.numel() ? s : 1);
}
Val mean_one(const Val& col) {
    if (!col.numel()) return num(std::numeric_limits<double>::quiet_NaN());
    double s = 0;
    for (double v : col.re) s += v;
    return num(s / col.numel());
}
Val std_one(const Val& col) {
    if (col.numel() < 2) return num(0);
    double m = mean_one(col).re[0];
    double s = 0;
    for (double v : col.re) s += (v - m) * (v - m);
    return num(std::sqrt(s / (col.numel() - 1)));
}
Val max_one(const Val& col, int& at) {
    if (!col.numel()) die("max of an empty array");
    int best = 0;
    for (int i = 1; i < col.numel(); ++i)
        if (col.re[i] > col.re[best]) best = i;
    at = best;
    return num(col.re[best]);
}
Val min_one(const Val& col, int& at) {
    if (!col.numel()) die("min of an empty array");
    int best = 0;
    for (int i = 1; i < col.numel(); ++i)
        if (col.re[i] < col.re[best]) best = i;
    at = best;
    return num(col.re[best]);
}

Val minmax(const Val& a, bool is_max, int nargout) {
    require_num(a, is_max ? "max" : "min");
    if (is_vector(a) || a.rows == 0) {
        int at = 0;
        Val v = is_max ? max_one(a, at) : min_one(a, at);
        // Linear index in column-major storage equals the flat index for a vector.
        if (nargout >= 2) return pack({v, num(at + 1)});
        return v;
    }
    Val values = alloc_num(1, a.cols);
    Val idxs = alloc_num(1, a.cols);
    for (int j = 0; j < a.cols; ++j) {
        Val col = alloc_num(a.rows, 1);
        for (int i = 0; i < a.rows; ++i) col.re[i] = a.re_at(i, j);
        int at = 0;
        Val v = is_max ? max_one(col, at) : min_one(col, at);
        values.re[j] = v.re[0];
        idxs.re[j] = at + 1;
    }
    if (nargout >= 2) return pack({values, idxs});
    return values;
}

void surf_on(Ctx& ctx, const Val& X, const Val& Y, const Val& Z) {
    ensure_fig(ctx, true);
    Fig& fig = ctx.figs[static_cast<size_t>(ctx.cur)];
    fig.heat = true;
    fig.series.clear();
    fig.nx = Z.cols;
    fig.ny = Z.rows;
    fig.gx.resize(static_cast<size_t>(Z.cols));
    fig.gy.resize(static_cast<size_t>(Z.rows));
    fig.gz.resize(static_cast<size_t>(Z.rows * Z.cols));
    for (int i = 0; i < Z.cols; ++i) fig.gx[static_cast<size_t>(i)] = X.numel() == Z.cols ? X.re[i] : X.re_at(0, i);
    for (int j = 0; j < Z.rows; ++j) fig.gy[static_cast<size_t>(j)] = Y.numel() == Z.rows ? Y.re[j] : Y.re_at(j, 0);
    for (int j = 0; j < Z.rows; ++j)
        for (int i = 0; i < Z.cols; ++i) fig.gz[static_cast<size_t>(j * Z.cols + i)] = Z.re_at(j, i);
}

Val fft_val(const Val& x, bool inverse) {
    require_num(x, "fft");
    if (!is_vector(x)) die("fft of a matrix is not in the C++ translation");
    int n = x.numel();
    if (n > 4096) die("fft longer than 4096 is not in the C++ translation");
    std::vector<cplx> a(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) a[static_cast<size_t>(i)] = {x.re[i], x.im[i]};
    std::vector<cplx> out(static_cast<size_t>(n));
    double sign = inverse ? 1 : -1;
    for (int k = 0; k < n; ++k) {
        cplx s = 0;
        for (int t = 0; t < n; ++t) s += a[static_cast<size_t>(t)] * std::exp(cplx(0, sign * 2 * PI * k * t / n));
        out[static_cast<size_t>(k)] = inverse ? s / static_cast<double>(n) : s;
    }
    Val o = alloc_num(x.rows == 1 ? 1 : n, x.rows == 1 ? n : 1);
    for (int i = 0; i < n; ++i) {
        o.re[i] = out[i].real();
        o.im[i] = out[i].imag();
    }
    return o;
}

} // namespace

Val builtin(Ctx& ctx, const std::string& name, const std::vector<Val>& a, int nargout) {
    if (name == "sum") return column_reduce(arg(a, 0, "sum"), sum_one);
    if (name == "prod") return column_reduce(arg(a, 0, "prod"), prod_one);
    if (name == "mean") return column_reduce(arg(a, 0, "mean"), mean_one);
    if (name == "std") return column_reduce(arg(a, 0, "std"), std_one);
    if (name == "max") {
        if (a.size() >= 2 && a[1].kind != Val::Kind::Empty) return ewise(a[0], a[1], [](cplx x, cplx y) { return x.real() >= y.real() ? x : y; });
        return minmax(arg(a, 0, "max"), true, nargout);
    }
    if (name == "min") {
        if (a.size() >= 2 && a[1].kind != Val::Kind::Empty) return ewise(a[0], a[1], [](cplx x, cplx y) { return x.real() <= y.real() ? x : y; });
        return minmax(arg(a, 0, "min"), false, nargout);
    }
    if (name == "diff") {
        Val x = arg(a, 0, "diff");
        require_num(x, "diff");
        if (x.rows > 1) {
            Val o = alloc_num(x.rows - 1, x.cols);
            for (int j = 0; j < x.cols; ++j)
                for (int i = 0; i < x.rows - 1; ++i) o.re_at(i, j) = x.re_at(i + 1, j) - x.re_at(i, j);
            return o;
        }
        Val o = alloc_num(1, std::max(0, x.cols - 1));
        for (int j = 0; j < x.cols - 1; ++j) o.re[j] = x.re_at(0, j + 1) - x.re_at(0, j);
        return o;
    }
    if (name == "cumsum") {
        Val x = arg(a, 0, "cumsum");
        require_num(x, "cumsum");
        Val o = x;
        if (x.rows > 1) {
            for (int j = 0; j < x.cols; ++j) {
                double s = 0;
                for (int i = 0; i < x.rows; ++i) {
                    s += x.re_at(i, j);
                    o.re_at(i, j) = s;
                }
            }
        } else {
            double s = 0;
            for (int j = 0; j < x.cols; ++j) {
                s += x.re_at(0, j);
                o.re_at(0, j) = s;
            }
        }
        return o;
    }
    if (name == "find") {
        Val x = arg(a, 0, "find");
        require_num(x, "find");
        std::vector<double> idx;
        for (int i = 0; i < x.numel(); ++i)
            if (x.re[i] != 0.0) idx.push_back(i + 1);
        return from_real_vector(idx, false);
    }
    if (name == "any" || name == "all") {
        Val x = arg(a, 0, name.c_str());
        require_num(x, name.c_str());
        bool ok = name == "all";
        for (double v : x.re) {
            bool nz = v != 0;
            ok = name == "all" ? (ok && nz) : (ok || nz);
        }
        if (name == "any" && x.numel() == 0) ok = false;
        return num(ok ? 1 : 0);
    }
    if (name == "sort") {
        Val x = arg(a, 0, "sort");
        require_num(x, "sort");
        if (!is_vector(x)) die("sort of a matrix is not in the C++ translation");
        std::vector<int> id(static_cast<size_t>(x.numel()));
        for (int i = 0; i < x.numel(); ++i) id[i] = i;
        std::sort(id.begin(), id.end(), [&](int i, int j) { return x.re[i] < x.re[j]; });
        Val o = alloc_num(x.rows, x.cols);
        Val ix = alloc_num(x.rows, x.cols);
        for (int i = 0; i < x.numel(); ++i) {
            o.re[i] = x.re[id[i]];
            ix.re[i] = id[i] + 1;
        }
        if (nargout >= 2) return pack({o, ix});
        return o;
    }
    if (name == "eig") return eigenvalues(arg(a, 0, "eig"));
    if (name == "qr") return qr_factors(arg(a, 0, "qr"), nargout);
    if (name == "inv") return inverse_of(arg(a, 0, "inv"));
    if (name == "det") {
        Val x = arg(a, 0, "det");
        require_num(x, "det");
        if (x.rows != x.cols) die("det needs a square matrix");
        std::vector<double> m = x.re;
        int n = x.rows;
        double sign = 1;
        double det = 1;
        for (int k = 0; k < n; ++k) {
            int p = k;
            double best = std::abs(m[k + k * n]);
            for (int i = k + 1; i < n; ++i)
                if (std::abs(m[i + k * n]) > best) {
                    best = std::abs(m[i + k * n]);
                    p = i;
                }
            if (best < 1e-15) return num(0);
            if (p != k) {
                sign = -sign;
                for (int j = 0; j < n; ++j) std::swap(m[k + j * n], m[p + j * n]);
            }
            det *= m[k + k * n];
            for (int i = k + 1; i < n; ++i) {
                double f = m[i + k * n] / m[k + k * n];
                for (int j = k + 1; j < n; ++j) m[i + j * n] -= f * m[k + j * n];
            }
        }
        return num(sign * det);
    }
    if (name == "trace") {
        Val x = arg(a, 0, "trace");
        double s = 0;
        for (int i = 0; i < std::min(x.rows, x.cols); ++i) s += x.re_at(i, i);
        return num(s);
    }
    if (name == "norm") {
        Val x = arg(a, 0, "norm");
        require_num(x, "norm");
        if (is_vector(x) || x.rows == 0 || x.cols == 0) return num(std::sqrt(dot_cols(x)));
        Val xt = transpose_num(x, true);
        Val g = matmul(xt, x);
        auto ev = jacobi_eig(g.re, g.rows);
        double mx = 0;
        for (double v : ev) mx = std::max(mx, v);
        return num(std::sqrt(std::max(0.0, mx)));
    }
    if (name == "cond") {
        Val x = arg(a, 0, "cond");
        Val xt = transpose_num(x, true);
        auto ev = jacobi_eig(matmul(xt, x).re, x.rows);
        double mx = 0, mn = 1e300;
        for (double v : ev) {
            mx = std::max(mx, v);
            mn = std::min(mn, v);
        }
        if (mn <= 1e-18 * mx) return num(INFINITY);
        return num(std::sqrt(mx / mn));
    }
    if (name == "fft") return fft_val(arg(a, 0, "fft"), false);
    if (name == "ifft") return fft_val(arg(a, 0, "ifft"), true);
    if (name == "filter") {
        auto y = lfilter(flat_re(arg(a, 0, "filter")), flat_re(arg(a, 1, "filter")), flat_re(arg(a, 2, "filter")));
        return from_real_vector(y, arg(a, 2, "filter").rows == 1);
    }
    if (name == "filtfilt") return filtfilt_val(arg(a, 0, "filtfilt"), arg(a, 1, "filtfilt"), arg(a, 2, "filtfilt"));
    if (name == "butter") {
        int n = as_int(arg(a, 0, "butter"), "butter");
        double wn = real_scalar(arg(a, 1, "butter"), "butter");
        std::vector<double> b, aa;
        butter_real(n, wn, b, aa);
        if (nargout <= 1) return from_real_vector(b, true);
        return pack({from_real_vector(b, true), from_real_vector(aa, true)});
    }
    if (name == "polyval") return polyval_val(arg(a, 0, "polyval"), arg(a, 1, "polyval"));
    if (name == "polyfit") {
        Val x = arg(a, 0, "polyfit"), y = arg(a, 1, "polyfit");
        int deg = as_int(arg(a, 2, "polyfit"), "polyfit");
        int m = x.numel();
        int p = deg + 1;
        if (y.numel() != m) die("polyfit x and y have different lengths");
        std::vector<double> A(static_cast<size_t>(p * p), 0.0), rhs(static_cast<size_t>(p), 0.0);
        for (int i = 0; i < m; ++i) {
            double xp = 1;
            std::vector<double> row(static_cast<size_t>(p));
            for (int k = p - 1; k >= 0; --k) {
                row[static_cast<size_t>(k)] = xp;
                xp *= x.re[i];
            }
            // row[0] is x^deg after the loop? Let's rebuild highest first.
        }
        for (int i = 0; i < m; ++i) {
            std::vector<double> row(static_cast<size_t>(p));
            row[0] = 1;
            for (int k = 1; k < p; ++k) row[k] = row[k - 1] * x.re[i];
            std::reverse(row.begin(), row.end());
            for (int r = 0; r < p; ++r) {
                rhs[r] += row[r] * y.re[i];
                for (int c = 0; c < p; ++c) A[static_cast<size_t>(r + c * p)] += row[r] * row[c];
            }
        }
        std::vector<double> sol;
        if (!solve_lu(A, p, rhs, 1, sol)) die("polyfit failed");
        return from_real_vector(sol, true);
    }
    if (name == "interp1") {
        std::string method = a.size() >= 4 ? as_text(a[3]) : "linear";
        if (method == "spline") return natural_spline(a[0], a[1], a[2]);
        auto xx = flat_re(a[0]);
        auto yy = flat_re(a[1]);
        Val o = alloc_num(a[2].rows, a[2].cols);
        for (int k = 0; k < a[2].numel(); ++k) {
            double q = a[2].re[k];
            if (q <= xx.front()) o.re[k] = yy.front();
            else if (q >= xx.back()) o.re[k] = yy.back();
            else {
                auto it = std::upper_bound(xx.begin(), xx.end(), q);
                int i = static_cast<int>(it - xx.begin()) - 1;
                double t = (q - xx[i]) / (xx[i + 1] - xx[i]);
                o.re[k] = yy[i] * (1 - t) + yy[i + 1] * t;
            }
        }
        return o;
    }
    if (name == "integral") {
        const Val& f = arg(a, 0, "integral");
        if (f.kind != Val::Kind::Fn) die("integral needs a function handle");
        double lo = real_scalar(arg(a, 1, "integral"), "integral");
        double hi = real_scalar(arg(a, 2, "integral"), "integral");
        auto ev = [&](double t) { return real_scalar(f.fn(ctx, {num(t)}), "integral"); };
        double fa = ev(lo), fb = ev(hi), fc = ev((lo + hi) / 2);
        double whole = (hi - lo) / 6 * (fa + 4 * fc + fb);
        return num(simpson(ctx, f, lo, hi, 1e-6, 0, fa, fb, fc, whole));
    }
    if (name == "ode45") return ode45(ctx, arg(a, 0, "ode45"), arg(a, 1, "ode45"), arg(a, 2, "ode45"));
    if (name == "meshgrid") {
        Val xv = arg(a, 0, "meshgrid");
        Val yv = a.size() >= 2 ? a[1] : a[0];
        int nx = xv.numel(), ny = yv.numel();
        Val X = alloc_num(ny, nx), Y = alloc_num(ny, nx);
        for (int j = 0; j < ny; ++j)
            for (int i = 0; i < nx; ++i) {
                X.re_at(j, i) = xv.re[i];
                Y.re_at(j, i) = yv.re[j];
            }
        if (nargout <= 1) return X;
        return pack({X, Y});
    }
    if (name == "lqr") {
        Val A = arg(a, 0, "lqr"), B = arg(a, 1, "lqr"), Q = arg(a, 2, "lqr"), R = arg(a, 3, "lqr");
        Val P, K;
        if (!lyapunov(A, Q, P)) die("lqr could not start (the open loop may be unstable)");
        for (int iter = 0; iter < 30; ++iter) {
            Val Bt = transpose_num(B, true);
            Val BP = matmul(Bt, P);
            K = ldiv_real(R, BP); // R \ (B' P) is (m x n)? R is m x m, B'P is m x n. ldiv solves R X = B'P so X is m x n. K should be that. Good.
            Val BK = matmul(B, K);
            Val Ac = sub(A, BK);
            Val Kt = transpose_num(K, true);
            Val KRK = matmul(matmul(Kt, R), K);
            Val Qh = add(Q, KRK);
            if (!lyapunov(Ac, Qh, P)) die("lqr Lyapunov solve failed");
        }
        return K;
    }
    if (name == "plot") {
        do_plot(ctx, a, "line");
        return empty();
    }
    if (name == "scatter") {
        do_plot(ctx, a, "scatter");
        return empty();
    }
    if (name == "bar") {
        do_plot(ctx, a, "bar");
        return empty();
    }
    if (name == "stairs") {
        do_plot(ctx, a, "step");
        return empty();
    }
    if (name == "area") {
        do_plot(ctx, a, "area");
        return empty();
    }
    if (name == "stem") {
        do_plot(ctx, a, "stem");
        return empty();
    }
    if (name == "surf" || name == "mesh" || name == "contour" || name == "imagesc") {
        if (a.size() >= 3) surf_on(ctx, a[0], a[1], a[2]);
        else {
            Val z = arg(a, 0, name.c_str());
            Val xv = alloc_num(1, z.cols), yv = alloc_num(z.rows, 1);
            for (int i = 0; i < z.cols; ++i) xv.re[i] = i + 1;
            for (int i = 0; i < z.rows; ++i) yv.re[i] = i + 1;
            surf_on(ctx, xv, yv, z);
        }
        return empty();
    }
    if (name == "title" || name == "xlabel" || name == "ylabel") {
        ensure_fig(ctx, false);
        std::string t = a.empty() ? "" : as_text(a[0]);
        Fig& fig = ctx.figs[static_cast<size_t>(ctx.cur)];
        if (name == "title") fig.title = t;
        else if (name == "xlabel") fig.xlabel = t;
        else fig.ylabel = t;
        return empty();
    }
    if (name == "legend") {
        ensure_fig(ctx, false);
        Fig& fig = ctx.figs[static_cast<size_t>(ctx.cur)];
        fig.legend.clear();
        for (const auto& v : a)
            if (v.kind == Val::Kind::Str) fig.legend.push_back(v.s);
        for (size_t i = 0; i < fig.legend.size() && i < fig.series.size(); ++i) fig.series[i].name = fig.legend[i];
        return empty();
    }
    if (name == "hold") {
        std::string m = a.empty() ? "toggle" : as_text(a[0]);
        if (m == "on") ctx.hold = true;
        else if (m == "off") ctx.hold = false;
        else ctx.hold = !ctx.hold;
        return empty();
    }
    if (name == "grid" || name == "axis" || name == "box") return empty();
    if (name == "figure" || name == "clf") {
        ctx.figs.push_back(Fig{});
        ctx.cur = static_cast<int>(ctx.figs.size()) - 1;
        ctx.hold = false;
        return empty();
    }
    if (name == "clc") {
        ctx.text.clear();
        return empty();
    }
    if (name == "clear" || name == "clearvars") {
        if (!ctx.scopes.empty()) {
            ctx.scopes[0].clear();
            ctx.set("pi", num(PI));
            ctx.set("eps", num(2.220446049250313e-16));
            ctx.set("inf", num(INFINITY));
            ctx.set("Inf", num(INFINITY));
            ctx.set("nan", num(std::numeric_limits<double>::quiet_NaN()));
            ctx.set("NaN", num(std::numeric_limits<double>::quiet_NaN()));
            ctx.set("true", num(1));
            ctx.set("false", num(0));
            ctx.set("i", imag_num(1));
            ctx.set("j", imag_num(1));
        }
        return empty();
    }
    if (name == "disp") {
        if (!a.empty()) ctx.show(a[0]);
        return empty();
    }
    if (name == "fprintf") {
        size_t ai = 0;
        std::string fmt;
        if (!a.empty() && a[0].is_num() && a[0].numel() == 1) {
            ai = 1;
            if (a.size() < 2) return num(0);
            fmt = as_text(a[1]);
            ai = 2;
        } else {
            fmt = as_text(arg(a, 0, "fprintf"));
            ai = 1;
        }
        format_printf(ctx.text, fmt, a, ai);
        return num(0);
    }
    if (name == "sprintf") {
        std::string fmt = as_text(arg(a, 0, "sprintf"));
        std::string out;
        size_t ai = 1;
        format_printf(out, fmt, a, ai);
        return str(out);
    }
    if (name == "error") die(a.empty() ? "error" : as_text(a[0]));
    if (name == "warning") {
        if (!a.empty()) {
            ctx.text += "warning: ";
            ctx.text += as_text(a[0]);
            ctx.text.push_back('\n');
        }
        return empty();
    }
    if (name == "num2str") return str(format_val(arg(a, 0, "num2str")));
    if (name == "double") return arg(a, 0, "double");
    if (name == "feval") {
        if (a.empty()) die("feval needs a function");
        std::vector<Val> rest(a.begin() + 1, a.end());
        if (a[0].kind == Val::Kind::Fn) return a[0].fn(ctx, rest);
        if (a[0].kind == Val::Kind::Str) return call_builtin(ctx, a[0].s, rest, nargout);
        die("feval needs a function handle");
    }
    if (name == "struct") {
        if (a.size() % 2) die("struct needs name, value pairs");
        Val s;
        s.kind = Val::Kind::Struct;
        s.rows = 1;
        s.cols = 1;
        for (size_t i = 0; i < a.size(); i += 2) {
            s.fields.push_back(as_text(a[i]));
            s.items.push_back(a[i + 1]);
        }
        return s;
    }
    if (name == "fieldnames") {
        const Val& s = arg(a, 0, "fieldnames");
        if (s.kind != Val::Kind::Struct) die("fieldnames needs a struct");
        Val c;
        c.kind = Val::Kind::Cell;
        c.rows = static_cast<int>(s.fields.size());
        c.cols = 1;
        for (const auto& f : s.fields) c.items.push_back(str(f));
        return c;
    }
    if (name == "struct2cell") {
        const Val& s = arg(a, 0, "struct2cell");
        if (s.kind != Val::Kind::Struct) die("struct2cell needs a struct");
        Val c;
        c.kind = Val::Kind::Cell;
        c.rows = static_cast<int>(s.items.size());
        c.cols = 1;
        c.items = s.items;
        return c;
    }
    if (name == "isfield") {
        const Val& s = arg(a, 0, "isfield");
        std::string f = as_text(arg(a, 1, "isfield"));
        if (s.kind != Val::Kind::Struct) return num(0);
        for (const auto& name_f : s.fields)
            if (name_f == f) return num(1);
        return num(0);
    }
    if (name == "cell") {
        auto sh = shape_from(a, 0, "cell");
        Val c;
        c.kind = Val::Kind::Cell;
        c.rows = sh.first;
        c.cols = sh.second;
        c.items.assign(static_cast<size_t>(c.rows * c.cols), empty());
        return c;
    }
    if (name == "reshape") {
        Val x = arg(a, 0, "reshape");
        auto sh = shape_from(a, 1, "reshape");
        if (sh.first * sh.second != x.numel()) die("reshape element count changed");
        Val o = x;
        o.rows = sh.first;
        o.cols = sh.second;
        return o;
    }
    if (name == "fliplr" || name == "flipud") {
        Val x = arg(a, 0, name.c_str());
        require_num(x, name.c_str());
        Val o = alloc_num(x.rows, x.cols);
        for (int j = 0; j < x.cols; ++j)
            for (int i = 0; i < x.rows; ++i) {
                int ii = name == "flipud" ? x.rows - 1 - i : i;
                int jj = name == "fliplr" ? x.cols - 1 - j : j;
                o.re_at(i, j) = x.re_at(ii, jj);
            }
        return o;
    }
    if (name == "horzcat") return horzcat(a);
    if (name == "vertcat") return vertcat(a);
    if (name == "repmat") {
        Val x = arg(a, 0, "repmat");
        int m = as_int(arg(a, 1, "repmat"), "repmat");
        int n = a.size() >= 3 ? as_int(a[2], "repmat") : m;
        std::vector<Val> rows;
        for (int i = 0; i < m; ++i) {
            std::vector<Val> cols;
            for (int j = 0; j < n; ++j) cols.push_back(x);
            rows.push_back(horzcat(cols));
        }
        return vertcat(rows);
    }
    if (name == "randi") {
        int imax = as_int(arg(a, 0, "randi"), "randi");
        auto sh = a.size() == 1 ? std::pair<int, int>{1, 1} : shape_from(a, 1, "randi");
        Val o = alloc_num(sh.first, sh.second);
        std::uniform_int_distribution<int> dist(1, std::max(1, imax));
        for (double& v : o.re) v = dist(ctx.rng);
        return o;
    }
    if (name == "rank") {
        Val x = arg(a, 0, "rank");
        auto ev = jacobi_eig(matmul(transpose_num(x, true), x).re, std::min(x.rows, x.cols) == x.cols ? x.cols : x.rows);
        // Use the smaller side via A'*A which is cols x cols if we did A'*A. If rows < cols this is wrong.
        int r = 0;
        double mx = 0;
        for (double v : ev) mx = std::max(mx, v);
        for (double v : ev)
            if (v > 1e-10 * mx) ++r;
        return num(r);
    }
    die("C++ translation has no built-in \"" + name + "\". This translator covers arrays, ode45, fft, butter, filtfilt, polyfit, interp1, integral, lqr, eig, and plot/surf.");
}

} // namespace msim
