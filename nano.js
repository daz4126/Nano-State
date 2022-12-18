const loopDOMAttributes = (dom,callback) => {
  const attrs = dom.attributes;
  if (attrs && attrs.length) {
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs.item(i).name;
      if (name.startsWith('on')) {
        dom.removeAttribute(name);
        callback(name.slice(2), dom);
      }
    }
  }
  dom.childNodes.forEach((child) => loopDOMAttributes(child, callback));
};
const replace = (str, from, to) => {
  from.map((e, i) => str.replace(new RegExp(e, 'g'), to[i]));
  return str;
};
const same = (a, b) => a.length === b.length && a.every((e, i) => e === b[i]);
const cleanNode = node => { while (node.firstChild) node.removeChild(node.firstChild); }
const htmlEscape = str =>
  replace(str,['&', '>', '<', '"', "'", '`'],['&amp;', '&gt;', '&quot;', '&#39;', '&#39;', '&#96;']);
const toDOM = (html, events) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  loopDOMAttributes(template.content,(name, element) => {
      const event = events.shift();
      element.addEventListener(name,typeof event !== 'function' ? () => {} : event);
    },
  );
  return template.content;
};
class Template {
  constructor(literal, values) {
    this.lit = literal;
    this.values = values;
    this.result = "";
    this.events = [];
  }
  checkValues(values) {
    if (!same(values, this.values)) {
      this._update(values);
      return false;
    }
    return true;
  }
  checkLiteral(lit) {
    return same(lit, this.lit);
  }
  getResult() {
    if (this.result === "") {
      this._update();
    }
    return { result: this.result, events: this.events };
  }
  forceUpdate() {
    this._update();
  }
  _update(values = this.values) {
    this.result = "";
    this.events = [];
    values.forEach((val, i) => {
     let lit = this.lit[i];
     if (Array.isArray(val)) {
        val.forEach(item => {
          if (item.getResult){
            item.getResult()
          } 
        })
        val = val.map(item => item.result ? item.result : item).join("");
      }
      if (lit.endsWith("$")) {
        val = htmlEscape(val);
        lit = lit.slice(0, -1);
      }
      this.result += lit;
      if (lit.endsWith("=") || lit.endsWith('="') || val.getResult) {
        if (lit.split(" ").pop().startsWith("on")) {
          this.events.push(val);
        }
        const replacedVal = replace(val.toString(), ["'", '"'], [`\'`, `'`]);
        if (lit.endsWith("=")) {
          this.result += `"${replacedVal}"`;
        }
        if (lit.endsWith('="')) {
          this.result += `${replacedVal}`;
        }  
        if (val.getResult){
          val.getResult()
          this.result += val.result
          this.events = [...this.events,...val.events]
        } 
      }      
      else {
        this.result += val;
      }
    });
    this.result += this.lit[this.lit.length - 1];
  }
}
const Parts = new WeakMap();
const render = (template, node) => {
  const part = Parts.get(node);
  const addToPart = _ => {
    const { result, events } = template.getResult();
    Parts.set(node, template);
    cleanNode(node);
    node.appendChild(toDOM(result, events));
  };
  if (part) {
    if (!part.checkLiteral(template.lit)) {
      addToPart();
    } else if (!part.checkValues(template.values)) {
      cleanNode(node);
      node.appendChild(toDOM(part.result, part.events));
    }
  } else {
    addToPart();
  }
};
export default function Nano(State){  
  State = { ...State, ...(State.Calculate ? State.Calculate(State) : {}) };
  State.Evaluate = prop => ({...State}[prop]);
  State.HTML = (lit, ...values) => new Template(lit.raw, values);
  if (State.LocalStorageKey && localStorage.getItem(State.LocalStorageKey)) {
    State =  {...State,...JSON.parse(localStorage.getItem(State.LocalStorageKey))} 
  }
  render(State.View(State),State.Element || document.body);
  State.Update = (...transformers) => {  
    State = transformers.reduce((oldState,transformer) => {
       const {Update,HTML,View,Evaluate,Debug,...newState} = typeof(transformer) === "function" ? transformer(oldState) : transformer;
       Object.entries(newState).forEach(([prop,value])=> value.toString() === "[object Object]" ? newState[prop] = {...State[prop],...value} : value)
       return { ...oldState, ...newState, ...(State.Calculate ? State.Calculate({...oldState,...newState}) : {}) }},State)
    if (State.LocalStorageKey){
      localStorage.setItem(State.LocalStorageKey,JSON.stringify(State));
    }
    if (State.Debug) {
      console.log(JSON.stringify(State));
    } 
    render(State.View(State),State.Element || document.body);
  };
  return State.Update
}