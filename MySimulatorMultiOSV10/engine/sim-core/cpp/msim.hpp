// Runtime for MATLAB scripts translated to C++. Arrays are column-major, indexes
// are 1-based, and plot/surf record figures that main writes as JSON for the GUI.
#pragma once

#include <cmath>
#include <cstdint>
#include <functional>
#include <map>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

namespace msim {

inline thread_local int g_line = 0;

[[noreturn]] void die(const std::string& msg);

struct Ctx;

struct Val {
    enum class Kind { Num, Str, Cell, Struct, Fn, Multi, Empty, Colon } kind = Kind::Empty;
    int rows = 0;
    int cols = 0;
    std::vector<double> re;
    std::vector<double> im;
    bool logical = false;
    std::string s;
    std::vector<Val> items;
    std::vector<std::string> fields;
    int nargin = 0;
    std::function<Val(Ctx&, const std::vector<Val>&)> fn;

    int numel() const { return rows * cols; }
    bool is_num() const { return kind == Kind::Num; }
    double& re_at(int r, int c) { return re[static_cast<size_t>(r + c * rows)]; }
    double& im_at(int r, int c) { return im[static_cast<size_t>(r + c * rows)]; }
    double re_at(int r, int c) const { return re[static_cast<size_t>(r + c * rows)]; }
    double im_at(int r, int c) const { return im[static_cast<size_t>(r + c * rows)]; }
};

struct Series {
    std::string name;
    std::string mode;
    std::vector<double> x;
    std::vector<double> y;
};

struct Fig {
    std::string title;
    std::string xlabel;
    std::string ylabel;
    std::vector<std::string> legend;
    std::vector<Series> series;
    bool heat = false;
    int nx = 0;
    int ny = 0;
    std::vector<double> gx;
    std::vector<double> gy;
    std::vector<double> gz;
};

struct ReturnSignal : std::exception {
    const char* what() const noexcept override { return "return"; }
};

struct Ctx {
    std::vector<std::map<std::string, Val>> scopes;
    std::string text;
    int line = 0;
    int end_rows = 0;
    int end_cols = 0;
    int end_dim = 0;
    bool end_linear = false;
    bool end_set = false;
    int nargout = 1;
    std::mt19937_64 rng;
    std::vector<Fig> figs;
    int cur = -1;
    bool hold = false;

    Ctx();
    void mark(int n);
    void seed_rng(unsigned long long seed);
    void push();
    void pop();
    void set(const std::string& name, Val value);
    void bind(const std::string& name, Val value);
    bool has(const std::string& name) const;
    Val get(const std::string& name) const;
    void show(const Val& value);
    void show_named(const std::string& name, const Val& value);
    void finish(const std::string& path) const;
    void fail(const std::string& path, const std::string& error) const;
    double end_value() const;
    [[noreturn]] void error(const std::string& msg) const;
    void set_index_lazy(const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, Val value);
    void set_cell_lazy(const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, Val value);
    void set_field(const std::string& name, const std::string& field, Val value);
};

struct Frame {
    Ctx& ctx;
    explicit Frame(Ctx& ctx);
    ~Frame();
};

struct CellRow {
    std::vector<Val> items;
};

Val num(double v);
Val imag_num(double v);
Val str(std::string s);
Val empty();
Val all();
Val end_mark(Ctx& ctx);
Val colon(const Val& start, const Val& step, const Val& stop);
Val add(const Val& a, const Val& b);
Val sub(const Val& a, const Val& b);
Val mul(const Val& a, const Val& b);
Val ediv(const Val& a, const Val& b);
Val eldiv(const Val& a, const Val& b);
Val emul(const Val& a, const Val& b);
Val epow(const Val& a, const Val& b);
Val pow(const Val& a, const Val& b);
Val ldiv(const Val& a, const Val& b);
Val div(const Val& a, const Val& b);
Val cmp_lt(const Val& a, const Val& b);
Val cmp_le(const Val& a, const Val& b);
Val cmp_gt(const Val& a, const Val& b);
Val cmp_ge(const Val& a, const Val& b);
Val cmp_eq(const Val& a, const Val& b);
Val cmp_ne(const Val& a, const Val& b);
Val band(const Val& a, const Val& b);
Val bor(const Val& a, const Val& b);
Val andand(Ctx& ctx, const std::function<Val(Ctx&)>& a, const std::function<Val(Ctx&)>& b);
Val oror(Ctx& ctx, const std::function<Val(Ctx&)>& a, const std::function<Val(Ctx&)>& b);
Val uminus(const Val& a);
Val unot(const Val& a);
Val transpose(const Val& a, bool conjugate);
Val horzcat(const std::vector<Val>& parts);
Val vertcat(const std::vector<Val>& parts);
CellRow cell_row(std::vector<Val> items);
Val make_cell(const std::vector<CellRow>& rows);
Val field_get(const Val& a, const std::string& name);
Val dyn_field(const Val& a, const Val& key);
Val index_or_call_lazy(Ctx& ctx, const std::string& name, const std::vector<std::function<Val(Ctx&)>>& subs, int nargout);
Val cell_index_lazy(Ctx& ctx, const Val& base, const std::vector<std::function<Val(Ctx&)>>& subs);
Val lambda(int nargin, std::function<Val(Ctx&, const std::vector<Val>&)> fn);
Val pack(std::vector<Val> outs);
Val nth(const Val& v, int index);
Val handle(Ctx& ctx, const std::string& name);
bool is_true(const Val& v);
bool switch_eq(const Val& a, const Val& b);
int ncolumns(const Val& v);
Val column(const Val& v, int j);

} // namespace msim
