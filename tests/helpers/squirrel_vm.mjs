import fs from "node:fs";

class SqInt {
  constructor(v) {
    this.v = v | 0;
  }
}

function isSqInt(x) {
  return x instanceof SqInt;
}

function toJSNum(x) {
  return x instanceof SqInt ? x.v : x;
}

export class SqTable {
  constructor(entries = {}) {
    this.slots = new Map(Object.entries(entries));
  }
  has(k) {
    return this.slots.has(String(k));
  }
  get(k) {
    const key = String(k);
    if (!this.slots.has(key)) {
      throw new Error(`the index '${key}' does not exist`);
    }
    return this.slots.get(key);
  }
  set(k, v) {
    const key = String(k);
    if (!this.slots.has(key)) {
      throw new Error(`the index '${key}' does not exist`);
    }
    this.slots.set(key, v);
    return v;
  }
  newslot(k, v) {
    this.slots.set(String(k), v);
    return v;
  }
  rawget(k) {
    return this.get(k);
  }
  rawset(k, v) {
    return this.newslot(k, v);
  }
  rawin(k) {
    return this.has(k);
  }
  len() {
    return this.slots.size;
  }
}

export class SqClass {
  constructor(name, base = null) {
    this.name = name;
    this.base = base;
    this.locked = false;
    this.fields = new Map();
    this.methods = new Map();
    this.statics = new Map();
    if (base) {
      base.locked = true;
      for (const [k, v] of base.fields) this.fields.set(k, v);
      for (const [k, v] of base.methods) this.methods.set(k, v);
      for (const [k, v] of base.statics) this.statics.set(k, v);
    }
  }
  lock() {
    this.locked = true;
  }
  has(k) {
    const key = String(k);
    return this.methods.has(key) || this.statics.has(key) || this.fields.has(key);
  }
  get(k) {
    const key = String(k);
    if (this.methods.has(key)) return this.methods.get(key);
    if (this.statics.has(key)) return this.statics.get(key);
    if (this.fields.has(key)) return this.fields.get(key);
    throw new Error(`the index '${key}' does not exist`);
  }
  set() {
    throw new Error("trying to set 'class'");
  }
  newslot(k, v, isStatic = false) {
    if (this.locked) {
      throw new Error("the class is locked");
    }
    const key = String(k);
    if (isStatic) {
      if (v instanceof SqClosure || typeof v === "function") {
        this.methods.set(key, v);
      } else {
        this.statics.set(key, v);
      }
    } else if (v instanceof SqClosure || typeof v === "function") {
      this.methods.set(key, v);
    } else {
      this.fields.set(key, v);
    }
    return v;
  }
  instantiate(vm, args) {
    this.locked = true;
    const inst = new SqInstance(this);
    if (this.methods.has("constructor")) {
      const ctor = this.methods.get("constructor");
      vm.invokeCallable(ctor, inst, args);
    }
    return inst;
  }
}

export class SqInstance {
  constructor(cls) {
    this.cls = cls;
    this.fields = new Map();
    for (const [k, v] of cls.fields) {
      this.fields.set(k, cloneSqValue(v));
    }
  }
  has(k) {
    const key = String(k);
    return this.fields.has(key) || this.cls.has(key);
  }
  get(k) {
    const key = String(k);
    if (this.fields.has(key)) return this.fields.get(key);
    return this.cls.get(key);
  }
  set(k, v) {
    const key = String(k);
    if (this.fields.has(key)) {
      this.fields.set(key, v);
      return v;
    }
    if (this.cls.statics.has(key)) {
      this.cls.statics.set(key, v);
      return v;
    }
    throw new Error(`the index '${key}' does not exist`);
  }
  newslot() {
    throw new Error("cannot create new slot on instance");
  }
}

export class SqClosure {
  constructor(fnNode, outerScope, vm) {
    this.fnNode = fnNode;
    this.outerScope = outerScope;
    this.vm = vm;
  }
}

function cloneSqValue(v) {
  if (Array.isArray(v)) return [...v];
  if (v instanceof SqTable) {
    const t = new SqTable();
    for (const [k, val] of v.slots) t.slots.set(k, val);
    return t;
  }
  if (v instanceof SqInstance) {
    const copy = new SqInstance(v.cls);
    for (const [k, val] of v.fields) copy.fields.set(k, val);
    return copy;
  }
  return v;
}

function sqTypeof(v) {
  if (v === null || v === undefined) return "null";
  if (v instanceof SqInt) return "integer";
  if (typeof v === "number") return "float";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "array";
  if (v instanceof SqTable) return "table";
  if (v instanceof SqClass) return "class";
  if (v instanceof SqInstance) return "instance";
  if (v instanceof SqClosure || typeof v === "function") return "function";
  return typeof v;
}

// --- Lexer ---
function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const keywords = new Set([
    "local", "function", "class", "extends", "static", "return",
    "if", "else", "while", "for", "foreach", "in", "instanceof", "break", "continue",
    "true", "false", "null", "this", "clone", "typeof"
  ]);

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          i++;
          const esc = src[i];
          if (esc === "n") s += "\n";
          else if (esc === "r") s += "\r";
          else if (esc === "t") s += "\t";
          else s += esc;
        } else {
          if (src[i] === "\n") line++;
          s += src[i];
        }
        i++;
      }
      if (src[i] !== '"') throw new SyntaxError(`Unterminated string at line ${line}`);
      i++;
      tokens.push({ type: "string", value: s, line });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let num = "";
      if (ch === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        num = src.slice(i, i + 2);
        i += 2;
        while (i < src.length && /[0-9a-fA-F]/.test(src[i])) num += src[i++];
        tokens.push({ type: "int", value: parseInt(num, 16), line });
        continue;
      }
      let isFloat = false;
      while (i < src.length && /[0-9]/.test(src[i])) num += src[i++];
      if (src[i] === "." && /[0-9]/.test(src[i + 1])) {
        isFloat = true;
        num += src[i++];
        while (i < src.length && /[0-9]/.test(src[i])) num += src[i++];
      }
      tokens.push({
        type: isFloat ? "float" : "int",
        value: isFloat ? parseFloat(num) : parseInt(num, 10),
        line,
      });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
      tokens.push({ type: keywords.has(id) ? "kw" : "id", value: id, line });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<-", "::", "==", "!=", "<=", ">=", "&&", "||", "+=", "-=", "*=", "/=", "++", "--"].includes(two)) {
      tokens.push({ type: "op", value: two, line });
      i += 2;
      continue;
    }
    if ("+-*/%=<>!.,;:()[]{}".includes(ch)) {
      tokens.push({ type: "op", value: ch, line });
      i++;
      continue;
    }
    throw new SyntaxError(`Unexpected character '${ch}' at line ${line}`);
  }
  tokens.push({ type: "eof", value: "", line });
  return tokens;
}

// --- Parser ---
function parse(tokens) {
  let pos = 0;
  const peek = (off = 0) => tokens[pos + off] || tokens[tokens.length - 1];
  const next = () => tokens[pos++];
  const match = (type, val) => {
    const t = peek();
    if (t.type === type && (val === undefined || t.value === val)) {
      pos++;
      return t;
    }
    return null;
  };
  const expect = (type, val) => {
    const t = match(type, val);
    if (!t) {
      const cur = peek();
      throw new SyntaxError(`Expected ${val ?? type} but got '${cur.value}' (${cur.type}) at line ${cur.line}`);
    }
    return t;
  };
  const eatSemi = () => {
    while (match("op", ";")) {}
  };

  function parseProgram() {
    const body = [];
    eatSemi();
    while (peek().type !== "eof") {
      body.push(parseStmt());
      eatSemi();
    }
    return { kind: "Block", body };
  }

  function parseBlock() {
    expect("op", "{");
    const body = [];
    eatSemi();
    while (!match("op", "}")) {
      body.push(parseStmt());
      eatSemi();
    }
    return { kind: "Block", body };
  }

  function parseParams() {
    expect("op", "(");
    const params = [];
    if (!match("op", ")")) {
      do {
        const name = expect("id").value;
        const def = match("op", "=") ? parseExpr() : undefined;
        params.push({ name, def });
      } while (match("op", ","));
      expect("op", ")");
    }
    return params;
  }

  function parseStmt() {
    const t = peek();
    if (t.type === "op" && t.value === "{") return parseBlock();
    if (match("kw", "local")) {
      if (match("kw", "function")) {
        const name = expect("id").value;
        const params = parseParams();
        const body = parseBlock();
        return { kind: "LocalDecl", decls: [{ name, init: { kind: "FnExpr", name, params, body } }] };
      }
      const decls = [];
      do {
        const name = expect("id").value;
        const init = match("op", "=") ? parseExpr() : null;
        decls.push({ name, init });
      } while (match("op", ","));
      return { kind: "LocalDecl", decls };
    }
    if (match("kw", "function")) {
      const target = [expect("id").value];
      while (match("op", "::")) target.push(expect("id").value);
      const params = parseParams();
      const body = parseBlock();
      return { kind: "FnDecl", target, params, body };
    }
    if (match("kw", "class")) {
      const name = expect("id").value;
      const base = match("kw", "extends") ? parseExpr() : null;
      expect("op", "{");
      const members = [];
      eatSemi();
      while (!match("op", "}")) {
        const isStatic = Boolean(match("kw", "static"));
        if (match("kw", "function")) {
          const mname = expect("id").value;
          const params = parseParams();
          const body = parseBlock();
          members.push({ isStatic, name: mname, value: { kind: "FnExpr", name: mname, params, body } });
        } else if (peek().type === "id" && peek().value === "constructor" && peek(1).value === "(") {
          next();
          const params = parseParams();
          const body = parseBlock();
          members.push({ isStatic: false, name: "constructor", value: { kind: "FnExpr", name: "constructor", params, body } });
        } else {
          const mname = expect("id").value;
          if (!match("op", "=") && !match("op", "<-")) {
            throw new SyntaxError(`Expected '=' in class member '${mname}' at line ${peek().line}`);
          }
          const val = parseExpr();
          members.push({ isStatic, name: mname, value: val });
        }
        eatSemi();
      }
      return { kind: "ClassDecl", name, base, members };
    }
    if (match("kw", "if")) {
      expect("op", "(");
      const cond = parseExpr();
      expect("op", ")");
      const thenBranch = parseStmt();
      eatSemi();
      const elseBranch = match("kw", "else") ? parseStmt() : null;
      return { kind: "If", cond, thenBranch, elseBranch };
    }
    if (match("kw", "while")) {
      expect("op", "(");
      const cond = parseExpr();
      expect("op", ")");
      const body = parseStmt();
      return { kind: "While", cond, body };
    }
    if (match("kw", "for")) {
      expect("op", "(");
      const init = peek().value === ";" ? null : parseStmt();
      expect("op", ";");
      const cond = peek().value === ";" ? null : parseExpr();
      expect("op", ";");
      const step = peek().value === ")" ? null : parseExpr();
      expect("op", ")");
      const body = parseStmt();
      return { kind: "For", init, cond, step, body };
    }
    if (match("kw", "foreach")) {
      expect("op", "(");
      const first = expect("id").value;
      let idxVar = null;
      let valVar = first;
      if (match("op", ",")) {
        idxVar = first;
        valVar = expect("id").value;
      }
      expect("kw", "in");
      const iter = parseExpr();
      expect("op", ")");
      const body = parseStmt();
      return { kind: "Foreach", idxVar, valVar, iter, body };
    }
    if (match("kw", "return")) {
      const cur = peek();
      if (cur.value === ";" || cur.value === "}" || cur.type === "eof") {
        return { kind: "Return", expr: null };
      }
      return { kind: "Return", expr: parseExpr() };
    }
    if (match("kw", "break")) return { kind: "Break" };
    if (match("kw", "continue")) return { kind: "Continue" };
    return { kind: "ExprStmt", expr: parseExpr() };
  }

  function parseExpr() {
    return parseAssign();
  }

  function parseAssign() {
    const left = parseOr();
    const t = peek();
    if (t.type === "op" && ["=", "<-", "+=", "-=", "*=", "/="].includes(t.value)) {
      const op = next().value;
      const right = parseAssign();
      return { kind: "Assign", op, left, right };
    }
    return left;
  }

  function parseOr() {
    let left = parseAnd();
    while (match("op", "||")) left = { kind: "Logical", op: "||", left, right: parseAnd() };
    return left;
  }

  function parseAnd() {
    let left = parseEq();
    while (match("op", "&&")) left = { kind: "Logical", op: "&&", left, right: parseEq() };
    return left;
  }

  function parseEq() {
    let left = parseRel();
    while (peek().type === "op" && ["==", "!="].includes(peek().value)) {
      const op = next().value;
      left = { kind: "Binary", op, left, right: parseRel() };
    }
    return left;
  }

  function parseRel() {
    let left = parseAdd();
    while (
      (peek().type === "op" && ["<", "<=", ">", ">="].includes(peek().value)) ||
      (peek().type === "kw" && (peek().value === "in" || peek().value === "instanceof"))
    ) {
      const op = next().value;
      left = { kind: "Binary", op, left, right: parseAdd() };
    }
    return left;
  }

  function parseAdd() {
    let left = parseMul();
    while (peek().type === "op" && ["+", "-"].includes(peek().value)) {
      const op = next().value;
      left = { kind: "Binary", op, left, right: parseMul() };
    }
    return left;
  }

  function parseMul() {
    let left = parseUnary();
    while (peek().type === "op" && ["*", "/", "%"].includes(peek().value)) {
      const op = next().value;
      left = { kind: "Binary", op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === "op" && ["!", "-", "++", "--"].includes(peek().value)) {
      const op = next().value;
      return { kind: "Unary", op, expr: parseUnary(), prefix: true };
    }
    if (match("kw", "clone")) return { kind: "Unary", op: "clone", expr: parseUnary(), prefix: true };
    if (match("kw", "typeof")) return { kind: "Unary", op: "typeof", expr: parseUnary(), prefix: true };
    return parsePostfix();
  }

  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (match("op", ".")) {
        const prop = expect("id").value;
        expr = { kind: "Member", obj: expr, prop };
      } else if (match("op", "[")) {
        const index = parseExpr();
        expect("op", "]");
        expr = { kind: "Index", obj: expr, index };
      } else if (match("op", "(")) {
        const args = [];
        if (!match("op", ")")) {
          do {
            args.push(parseExpr());
          } while (match("op", ","));
          expect("op", ")");
        }
        expr = { kind: "Call", callee: expr, args };
      } else if (peek().type === "op" && ["++", "--"].includes(peek().value)) {
        const op = next().value;
        expr = { kind: "Unary", op, expr, prefix: false };
      } else {
        break;
      }
    }
    return expr;
  }

  function parsePrimary() {
    const t = peek();
    if (match("op", "::")) {
      return { kind: "RootId", name: expect("id").value };
    }
    if (t.type === "int") {
      next();
      return { kind: "Int", value: t.value };
    }
    if (t.type === "float") {
      next();
      return { kind: "Float", value: t.value };
    }
    if (t.type === "string") {
      next();
      return { kind: "String", value: t.value };
    }
    if (match("kw", "true")) return { kind: "Bool", value: true };
    if (match("kw", "false")) return { kind: "Bool", value: false };
    if (match("kw", "null")) return { kind: "Null" };
    if (match("kw", "this")) return { kind: "This" };
    if (match("kw", "function")) {
      const name = peek().type === "id" ? next().value : null;
      const params = parseParams();
      const body = parseBlock();
      return { kind: "FnExpr", name, params, body };
    }
    if (t.type === "id") {
      next();
      return { kind: "Id", name: t.value };
    }
    if (match("op", "(")) {
      const e = parseExpr();
      expect("op", ")");
      return e;
    }
    if (match("op", "[")) {
      const items = [];
      if (!match("op", "]")) {
        do {
          if (peek().value === "]") break;
          items.push(parseExpr());
        } while (match("op", ","));
        expect("op", "]");
      }
      return { kind: "Array", items };
    }
    if (match("op", "{")) {
      const entries = [];
      eatSemi();
      while (!match("op", "}")) {
        let key;
        if (match("op", "[")) {
          key = parseExpr();
          expect("op", "]");
          expect("op", "=");
        } else {
          const k = expect("id").value;
          key = { kind: "String", value: k };
          expect("op", "=");
        }
        const val = parseExpr();
        entries.push({ key, val });
        match("op", ",");
        eatSemi();
      }
      return { kind: "Table", entries };
    }
    throw new SyntaxError(`Unexpected token '${t.value}' (${t.type}) at line ${t.line}`);
  }

  return parseProgram();
}

// --- Evaluator ---
class ReturnSignal {
  constructor(val) {
    this.val = val;
  }
}
class BreakSignal {}
class ContinueSignal {}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.vars = new Map();
  }
  declare(name, val) {
    this.vars.set(name, val);
  }
  find(name) {
    if (this.vars.has(name)) return this;
    return this.parent ? this.parent.find(name) : null;
  }
}

export class SquirrelVM {
  constructor(initialRoot = {}) {
    this.root = new SqTable();
    this.activeScopes = [];
    this.root.newslot("getroottable", () => this.root);
    this.root.newslot("array", (size, fill = null) => {
      const n = toJSNum(size);
      return Array.from({ length: n }, () => fill);
    });
    this.root.newslot("assert", (cond, msg = "assertion failed") => {
      if (!this.isTruthy(cond)) throw new Error(String(msg));
    });
    for (const [k, v] of Object.entries(initialRoot)) {
      this.root.newslot(k, this.wrapFromJS(v));
    }
  }

  wrapFromJS(v) {
    if (typeof v === "number" && Number.isInteger(v)) return new SqInt(v);
    if (v && typeof v === "object" && !(v instanceof SqTable) && !(v instanceof SqClass) && !(v instanceof SqInstance) && !(v instanceof SqClosure) && !(v instanceof SqInt) && !Array.isArray(v)) {
      const t = new SqTable();
      for (const [k, val] of Object.entries(v)) {
        t.newslot(k, this.wrapFromJS(val));
      }
      return t;
    }
    if (Array.isArray(v)) return v.map((x) => this.wrapFromJS(x));
    return v;
  }

  unwrapToJS(v) {
    if (v instanceof SqInt) return v.v;
    if (Array.isArray(v)) return v.map((x) => this.unwrapToJS(x));
    return v;
  }

  isTruthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v instanceof SqInt) return v.v !== 0;
    if (typeof v === "number") return v !== 0;
    return true;
  }

  sqEquals(a, b) {
    if (a instanceof SqInt || typeof a === "number") {
      if (b instanceof SqInt || typeof b === "number") {
        return toJSNum(a) === toJSNum(b);
      }
      return false;
    }
    return a === b;
  }

  runSource(source) {
    const ast = parse(tokenize(source));
    const scope = new Scope(null);
    const res = this.execStmt(ast, scope, this.root);
    if (res instanceof ReturnSignal) return res.val;
    return null;
  }

  runFile(filePath) {
    return this.runSource(fs.readFileSync(filePath, "utf8"));
  }

  getProp(obj, prop) {
    if (obj === null || obj === undefined) {
      throw new Error(`attempt to index null with '${prop}'`);
    }
    if (Array.isArray(obj)) {
      if (prop === "len") return () => new SqInt(obj.length);
      if (prop === "push" || prop === "append") return (v) => { obj.push(v); return null; };
      if (prop === "pop") return () => obj.pop();
      if (prop === "remove") return (idx) => { const i = toJSNum(idx); return obj.splice(i, 1)[0]; };
      if (prop === "insert") return (idx, v) => { obj.splice(toJSNum(idx), 0, v); return null; };
      if (prop === "extend") return (other) => { obj.push(...other); return null; };
      if (prop === "clear") return () => { obj.length = 0; return null; };
      if (prop === "find") return (val) => {
        const idx = obj.findIndex((x) => this.sqEquals(x, val));
        return idx >= 0 ? new SqInt(idx) : null;
      };
      if (prop === "slice") return (s, e) => obj.slice(toJSNum(s), e !== undefined ? toJSNum(e) : undefined);
      const n = Number(prop);
      if (Number.isInteger(n) && n >= 0 && n < obj.length) return obj[n];
      throw new Error(`the index '${prop}' does not exist on array`);
    }
    if (typeof obj === "string") {
      if (prop === "len") return () => new SqInt(obj.length);
      if (prop === "find") return (sub, start = 0) => {
        const idx = obj.indexOf(String(sub), toJSNum(start));
        return idx >= 0 ? new SqInt(idx) : null;
      };
      if (prop === "slice") return (s, e) => obj.slice(toJSNum(s), e !== undefined ? toJSNum(e) : undefined);
      throw new Error(`the index '${prop}' does not exist on string`);
    }
    if (obj instanceof SqClosure || typeof obj === "function") {
      if (prop === "call") {
        return (thisArg, ...args) => this.invokeCallable(obj, thisArg, args);
      }
      if (prop === "acall") {
        return (argArray) => this.invokeCallable(obj, argArray[0], argArray.slice(1));
      }
      if (prop === "bindenv") {
        return (envObj) => (...args) => this.invokeCallable(obj, envObj, args);
      }
    }
    if (obj instanceof SqTable || obj instanceof SqClass || obj instanceof SqInstance) {
      if (prop === "rawget") return (k) => obj.get(k);
      if (prop === "rawset") return (k, v) => obj.newslot(k, v);
      if (prop === "rawin") return (k) => obj.has(k);
      if (prop === "len" && obj instanceof SqTable) return () => new SqInt(obj.len());
      return obj.get(prop);
    }
    if (prop in obj) return obj[prop];
    throw new Error(`the index '${prop}' does not exist`);
  }

  setProp(obj, prop, val, isNewSlot = false) {
    if (Array.isArray(obj)) {
      const i = toJSNum(prop);
      if (i < 0 || i >= obj.length) throw new Error(`index ${i} out of range`);
      obj[i] = val;
      return val;
    }
    if (obj instanceof SqTable || obj instanceof SqClass || obj instanceof SqInstance) {
      return isNewSlot ? obj.newslot(prop, val) : obj.set(prop, val);
    }
    obj[prop] = val;
    return val;
  }

  hasProp(obj, key) {
    if (Array.isArray(obj)) {
      const n = toJSNum(key);
      return Number.isInteger(n) && n >= 0 && n < obj.length;
    }
    if (obj instanceof SqTable || obj instanceof SqClass || obj instanceof SqInstance) {
      return obj.has(key);
    }
    return key in obj;
  }

  invokeCallable(callee, thisObj, args) {
    if (callee instanceof SqClass) {
      return callee.instantiate(this, args);
    }
    if (callee instanceof SqClosure) {
      const fn = callee.fnNode;
      const callScope = new Scope(callee.outerScope);
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        if (i < args.length) {
          callScope.declare(p.name, args[i]);
        } else if (p.def !== undefined) {
          callScope.declare(p.name, this.evalExpr(p.def, callScope, thisObj));
        } else {
          throw new Error(`wrong number of parameters for '${fn.name ?? "<anonymous>"}'`);
        }
      }
      const res = this.withScope(callScope, () => this.execStmt(fn.body, callScope, thisObj));
      return res instanceof ReturnSignal ? res.val : null;
    }
    if (typeof callee === "function") {
      const res = callee.apply(thisObj, args);
      return typeof res === "number" && Number.isInteger(res) ? new SqInt(res) : (res ?? null);
    }
    throw new Error(`attempt to call a ${sqTypeof(callee)} value`);
  }

  withScope(scope, fn) {
    this.activeScopes.push(scope);
    try {
      return fn();
    } finally {
      this.activeScopes.pop();
    }
  }

  findReachableInstances(predicate) {
    const seen = new Set();
    const matches = [];
    const visit = (val) => {
      if (!val || typeof val !== "object" || seen.has(val)) return;
      seen.add(val);
      if (val instanceof SqInstance && predicate(val)) {
        matches.push(val);
      }
      if (Array.isArray(val)) {
        for (const item of val) visit(item);
      } else if (val instanceof SqTable) {
        for (const item of val.slots.values()) visit(item);
      } else if (val instanceof SqInstance) {
        for (const item of val.fields.values()) visit(item);
      }
    };
    visit(this.root);
    for (const sc of this.activeScopes) {
      let cur = sc;
      while (cur) {
        for (const v of cur.vars.values()) visit(v);
        cur = cur.parent;
      }
    }
    return matches;
  }

  execStmt(stmt, scope, thisObj) {
    switch (stmt.kind) {
      case "Block": {
        const blockScope = new Scope(scope);
        return this.withScope(blockScope, () => {
          for (const s of stmt.body) {
            const r = this.execStmt(s, blockScope, thisObj);
            if (r instanceof ReturnSignal || r instanceof BreakSignal || r instanceof ContinueSignal) return r;
          }
          return null;
        });
      }
      case "LocalDecl": {
        for (const d of stmt.decls) {
          const val = d.init ? this.evalExpr(d.init, scope, thisObj) : null;
          scope.declare(d.name, val);
        }
        return null;
      }
      case "FnDecl": {
        const closure = new SqClosure(
          { name: stmt.target[stmt.target.length - 1], params: stmt.params, body: stmt.body },
          scope,
          this
        );
        if (stmt.target.length === 1) {
          const targetObj = thisObj ?? this.root;
          this.setProp(targetObj, stmt.target[0], closure, true);
        } else {
          let container = this.resolveIdentifier(stmt.target[0], scope, thisObj);
          for (let i = 1; i < stmt.target.length - 1; i++) {
            container = this.getProp(container, stmt.target[i]);
          }
          this.setProp(container, stmt.target[stmt.target.length - 1], closure, true);
        }
        return null;
      }
      case "ClassDecl": {
        const base = stmt.base ? this.evalExpr(stmt.base, scope, thisObj) : null;
        if (base && !(base instanceof SqClass)) {
          throw new Error(`extends target for '${stmt.name}' is not a class`);
        }
        const cls = new SqClass(stmt.name, base);
        for (const m of stmt.members) {
          const val = this.evalExpr(m.value, scope, thisObj);
          cls.newslot(m.name, val, m.isStatic);
        }
        this.setProp(thisObj ?? this.root, stmt.name, cls, true);
        return null;
      }
      case "If": {
        if (this.isTruthy(this.evalExpr(stmt.cond, scope, thisObj))) {
          return this.execStmt(stmt.thenBranch, scope, thisObj);
        } else if (stmt.elseBranch) {
          return this.execStmt(stmt.elseBranch, scope, thisObj);
        }
        return null;
      }
      case "While": {
        while (this.isTruthy(this.evalExpr(stmt.cond, scope, thisObj))) {
          const r = this.execStmt(stmt.body, scope, thisObj);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
        }
        return null;
      }
      case "For": {
        const forScope = new Scope(scope);
        if (stmt.init) this.execStmt(stmt.init, forScope, thisObj);
        while (!stmt.cond || this.isTruthy(this.evalExpr(stmt.cond, forScope, thisObj))) {
          const r = this.execStmt(stmt.body, forScope, thisObj);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
          if (stmt.step) this.evalExpr(stmt.step, forScope, thisObj);
        }
        return null;
      }
      case "Foreach": {
        const container = this.evalExpr(stmt.iter, scope, thisObj);
        let pairs = [];
        if (Array.isArray(container)) {
          pairs = container.map((v, idx) => [new SqInt(idx), v]);
        } else if (container instanceof SqTable) {
          pairs = Array.from(container.slots.entries());
        } else {
          throw new Error(`foreach over unsupported ${sqTypeof(container)}`);
        }
        for (const [k, v] of pairs) {
          const loopScope = new Scope(scope);
          if (stmt.idxVar) loopScope.declare(stmt.idxVar, k);
          loopScope.declare(stmt.valVar, v);
          const r = this.execStmt(stmt.body, loopScope, thisObj);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
        }
        return null;
      }
      case "Return":
        return new ReturnSignal(stmt.expr ? this.evalExpr(stmt.expr, scope, thisObj) : null);
      case "Break":
        return new BreakSignal();
      case "Continue":
        return new ContinueSignal();
      case "ExprStmt":
        this.evalExpr(stmt.expr, scope, thisObj);
        return null;
      default:
        throw new Error(`Unknown stmt kind ${stmt.kind}`);
    }
  }

  lookupBinding(name, scope, thisObj) {
    const found = scope.find(name);
    if (found) return { kind: "scope", holder: found, value: found.vars.get(name) };
    if (thisObj && this.hasProp(thisObj, name)) return { kind: "this", holder: thisObj, value: this.getProp(thisObj, name) };
    if (this.root.has(name)) return { kind: "root", holder: this.root, value: this.root.get(name) };
    throw new Error(`the index '${name}' does not exist`);
  }

  resolveIdentifier(name, scope, thisObj) {
    return this.lookupBinding(name, scope, thisObj).value;
  }

  assignTarget(target, val, op, scope, thisObj) {
    const compute = (oldVal) => {
      if (op === "=" || op === "<-") return val;
      return this.applyBinary(op[0], oldVal, val);
    };

    if (target.kind === "Id") {
      if (op === "<-") {
        return this.setProp(thisObj ?? this.root, target.name, val, true);
      }
      const found = scope.find(target.name);
      if (found) {
        const nextVal = compute(found.vars.get(target.name));
        found.vars.set(target.name, nextVal);
        return nextVal;
      }
      if (thisObj && this.hasProp(thisObj, target.name)) {
        const nextVal = compute(this.getProp(thisObj, target.name));
        return this.setProp(thisObj, target.name, nextVal, false);
      }
      if (this.root.has(target.name)) {
        const nextVal = compute(this.root.get(target.name));
        return this.root.set(target.name, nextVal);
      }
      throw new Error(`the index '${target.name}' does not exist`);
    }
    if (target.kind === "RootId") {
      if (op === "<-") return this.root.newslot(target.name, val);
      const nextVal = compute(this.root.get(target.name));
      return this.root.set(target.name, nextVal);
    }
    if (target.kind === "Member") {
      const obj = this.evalExpr(target.obj, scope, thisObj);
      if (op === "<-") return this.setProp(obj, target.prop, val, true);
      const nextVal = compute(this.getProp(obj, target.prop));
      return this.setProp(obj, target.prop, nextVal, false);
    }
    if (target.kind === "Index") {
      const obj = this.evalExpr(target.obj, scope, thisObj);
      const idx = this.evalExpr(target.index, scope, thisObj);
      if (op === "<-") return this.setProp(obj, idx, val, true);
      const oldVal = Array.isArray(obj) ? obj[toJSNum(idx)] : this.getProp(obj, idx);
      const nextVal = compute(oldVal);
      return this.setProp(obj, idx, nextVal, false);
    }
    throw new Error(`Invalid assignment target ${target.kind}`);
  }

  applyBinary(op, l, r) {
    if (op === "+") {
      if (typeof l === "string" || typeof r === "string") {
        const ls = l instanceof SqInt ? String(l.v) : String(l);
        const rs = r instanceof SqInt ? String(r.v) : String(r);
        return ls + rs;
      }
      if (isSqInt(l) && isSqInt(r)) return new SqInt((l.v + r.v) | 0);
      return toJSNum(l) + toJSNum(r);
    }
    if (op === "-") {
      if (isSqInt(l) && isSqInt(r)) return new SqInt((l.v - r.v) | 0);
      return toJSNum(l) - toJSNum(r);
    }
    if (op === "*") {
      if (isSqInt(l) && isSqInt(r)) return new SqInt(Math.imul(l.v, r.v));
      return toJSNum(l) * toJSNum(r);
    }
    if (op === "/") {
      if (isSqInt(l) && isSqInt(r)) return new SqInt(Math.trunc(l.v / r.v));
      return toJSNum(l) / toJSNum(r);
    }
    if (op === "%") {
      if (isSqInt(l) && isSqInt(r)) return new SqInt(l.v % r.v);
      return toJSNum(l) % toJSNum(r);
    }
    if (op === "==") return this.sqEquals(l, r);
    if (op === "!=") return !this.sqEquals(l, r);
    if (op === "<") return toJSNum(l) < toJSNum(r);
    if (op === "<=") return toJSNum(l) <= toJSNum(r);
    if (op === ">") return toJSNum(l) > toJSNum(r);
    if (op === ">=") return toJSNum(l) >= toJSNum(r);
    if (op === "in") return this.hasProp(r, l);
    if (op === "instanceof") {
      if (!(l instanceof SqInstance) || !(r instanceof SqClass)) return false;
      let cur = l.cls;
      while (cur) {
        if (cur === r) return true;
        cur = cur.base;
      }
      return false;
    }
    throw new Error(`Unknown binary operator '${op}'`);
  }

  evalExpr(expr, scope, thisObj) {
    switch (expr.kind) {
      case "Int": return new SqInt(expr.value);
      case "Float": return expr.value;
      case "String": return expr.value;
      case "Bool": return expr.value;
      case "Null": return null;
      case "This": return thisObj;
      case "Id": return this.resolveIdentifier(expr.name, scope, thisObj);
      case "RootId": return this.root.get(expr.name);
      case "FnExpr": return new SqClosure(expr, scope, this);
      case "Array": return expr.items.map((it) => this.evalExpr(it, scope, thisObj));
      case "Table": {
        const t = new SqTable();
        for (const e of expr.entries) {
          t.newslot(this.evalExpr(e.key, scope, thisObj), this.evalExpr(e.val, scope, thisObj));
        }
        return t;
      }
      case "Member": {
        const obj = this.evalExpr(expr.obj, scope, thisObj);
        return this.getProp(obj, expr.prop);
      }
      case "Index": {
        const obj = this.evalExpr(expr.obj, scope, thisObj);
        const idx = this.evalExpr(expr.index, scope, thisObj);
        if (Array.isArray(obj)) {
          const i = toJSNum(idx);
          if (i < 0 || i >= obj.length) throw new Error(`index ${i} out of range`);
          return obj[i];
        }
        return this.getProp(obj, idx);
      }
      case "Assign": {
        const val = this.evalExpr(expr.right, scope, thisObj);
        return this.assignTarget(expr.left, val, expr.op, scope, thisObj);
      }
      case "Logical": {
        const l = this.evalExpr(expr.left, scope, thisObj);
        if (expr.op === "&&") return this.isTruthy(l) ? this.evalExpr(expr.right, scope, thisObj) : l;
        return this.isTruthy(l) ? l : this.evalExpr(expr.right, scope, thisObj);
      }
      case "Binary": {
        const l = this.evalExpr(expr.left, scope, thisObj);
        const r = this.evalExpr(expr.right, scope, thisObj);
        return this.applyBinary(expr.op, l, r);
      }
      case "Unary": {
        if (expr.op === "++" || expr.op === "--") {
          const delta = new SqInt(expr.op === "++" ? 1 : -1);
          const oldVal = this.evalExpr(expr.expr, scope, thisObj);
          const newVal = this.applyBinary("+", oldVal, delta);
          this.assignTarget(expr.expr, newVal, "=", scope, thisObj);
          return expr.prefix ? newVal : oldVal;
        }
        const v = this.evalExpr(expr.expr, scope, thisObj);
        if (expr.op === "!") return !this.isTruthy(v);
        if (expr.op === "-") return isSqInt(v) ? new SqInt(-v.v) : -toJSNum(v);
        if (expr.op === "clone") return cloneSqValue(v);
        if (expr.op === "typeof") return sqTypeof(v);
        throw new Error(`Unsupported unary ${expr.op}`);
      }
      case "Call": {
        let receiver = thisObj;
        let callee;
        if (expr.callee.kind === "Member") {
          receiver = this.evalExpr(expr.callee.obj, scope, thisObj);
          callee = this.getProp(receiver, expr.callee.prop);
        } else if (expr.callee.kind === "Index") {
          receiver = this.evalExpr(expr.callee.obj, scope, thisObj);
          const idx = this.evalExpr(expr.callee.index, scope, thisObj);
          callee = Array.isArray(receiver) ? receiver[toJSNum(idx)] : this.getProp(receiver, idx);
        } else if (expr.callee.kind === "RootId") {
          receiver = this.root;
          callee = this.root.get(expr.callee.name);
        } else if (expr.callee.kind === "Id") {
          const binding = this.lookupBinding(expr.callee.name, scope, thisObj);
          if (binding.kind !== "scope") receiver = binding.holder;
          callee = binding.value;
        } else {
          callee = this.evalExpr(expr.callee, scope, thisObj);
        }
        const args = expr.args.map((a) => this.evalExpr(a, scope, thisObj));
        return this.invokeCallable(callee, receiver, args);
      }
      default:
        throw new Error(`Unknown expr kind ${expr.kind}`);
    }
  }
}
