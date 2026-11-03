const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = __dirname;
const DATA = process.env.DATA_FILE || path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
if (process.env.NODE_ENV === 'production' && ADMIN_KEY.length < 32) {
  console.error('Refusing to start: set ADMIN_KEY to a random secret of at least 32 characters.');
  process.exit(1);
}
const TRADER_ACCOUNT = process.env.TRADER_ACCOUNT || 'PayHerFirst';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';

function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { catalog: [
    { id:'item-1', name:'Example item', category:'Supplies', price:1000, image:'', description:'Replace this with a real Bloodlands item.', active:true }
  ], orders: [] }; }
}
let db = load();
function save() { fs.writeFileSync(DATA, JSON.stringify(db, null, 2)); }
function send(res, status, obj, headers={}) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', ...headers}); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c; if(s.length>1e6) req.destroy();}); req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}}); req.on('error',reject);}); }
function admin(req) { return req.headers['x-admin-key'] && req.headers['x-admin-key'] === ADMIN_KEY; }
async function notify(text) {
  if (!DISCORD_WEBHOOK) return;
  try { await fetch(DISCORD_WEBHOOK, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:text})}); } catch(e) { console.error('Discord notification failed:', e.message); }
}
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method==='GET' && url.pathname==='/api/config') return send(res,200,{traderAccount:TRADER_ACCOUNT});
    if (req.method==='GET' && url.pathname==='/api/catalog') return send(res,200,db.catalog.filter(i=>i.active));
    if (req.method==='GET' && url.pathname==='/api/orders') {
      if (!admin(req)) return send(res,401,{error:'Staff access required'});
      return send(res,200,db.orders);
    }
    if (req.method==='POST' && url.pathname==='/api/orders') {
      const b = await readBody(req);
      if (!b.playerName || !b.discordId || !Array.isArray(b.items) || !b.items.length) return send(res,400,{error:'Player name, Discord ID, and at least one item are required.'});
      const lines=[]; let total=0;
      for (const row of b.items) {
        const item=db.catalog.find(x=>x.id===row.id && x.active);
        const qty=Math.floor(Number(row.quantity));
        if (!item || !Number.isFinite(qty) || qty<1 || qty>99) return send(res,400,{error:'Invalid item or quantity.'});
        lines.push({id:item.id,name:item.name,price:Number(item.price),quantity:qty,lineTotal:Number(item.price)*qty}); total+=Number(item.price)*qty;
      }
      const order={id:'BL-'+crypto.randomBytes(3).toString('hex').toUpperCase(),playerName:String(b.playerName).slice(0,80),discordId:String(b.discordId).slice(0,40),items:lines,total,status:'Awaiting Payment',paymentStatus:'Unverified',createdAt:new Date().toISOString(),notes:String(b.notes||'').slice(0,500)};
      db.orders.unshift(order); save();
      await notify(`🛒 **New Bloodlands Trader order ${order.id}**\nPlayer: ${order.playerName} (<@${order.discordId}>)\nTotal: ${order.total.toLocaleString()} Cash\nStatus: Awaiting Payment\nItems: ${lines.map(x=>`${x.quantity}× ${x.name}`).join(', ')}`);
      return send(res,201,{order,traderAccount:TRADER_ACCOUNT});
    }
    if (req.method==='POST' && url.pathname==='/api/admin/catalog') {
      if (!admin(req)) return send(res,401,{error:'Staff access required'});
      const b=await readBody(req); const name=String(b.name||'').trim(); const price=Number(b.price);
      if (!name || !Number.isFinite(price) || price<0) return send(res,400,{error:'Valid name and non-negative price required.'});
      const item={id:'item-'+crypto.randomBytes(4).toString('hex'),name:name.slice(0,100),category:String(b.category||'General').slice(0,60),price:Math.round(price*100)/100,image:String(b.image||'').slice(0,500),description:String(b.description||'').slice(0,300),active:true};
      db.catalog.push(item); save(); return send(res,201,item);
    }
    if (req.method==='PATCH' && url.pathname.startsWith('/api/admin/catalog/')) {
      if (!admin(req)) return send(res,401,{error:'Staff access required'});
      const id=decodeURIComponent(url.pathname.split('/').pop()); const item=db.catalog.find(x=>x.id===id); if(!item) return send(res,404,{error:'Item not found'});
      const b=await readBody(req); if(b.name!==undefined)item.name=String(b.name).slice(0,100); if(b.price!==undefined){const p=Number(b.price);if(!Number.isFinite(p)||p<0)return send(res,400,{error:'Invalid price'});item.price=p;} if(b.active!==undefined)item.active=!!b.active; save(); return send(res,200,item);
    }
    if (req.method==='PATCH' && url.pathname.startsWith('/api/admin/orders/')) {
      if (!admin(req)) return send(res,401,{error:'Staff access required'});
      const id=decodeURIComponent(url.pathname.split('/').pop()); const order=db.orders.find(x=>x.id===id); if(!order) return send(res,404,{error:'Order not found'});
      const b=await readBody(req); const statuses=['Awaiting Payment','Payment Verified','Approved','Ready for Pickup','Completed','Rejected','Refund Pending','Refunded'];
      if(b.status && !statuses.includes(b.status)) return send(res,400,{error:'Invalid status'});
      if(b.status) order.status=b.status; if(b.paymentStatus) order.paymentStatus=String(b.paymentStatus).slice(0,40); if(b.staffNotes!==undefined)order.staffNotes=String(b.staffNotes).slice(0,500); order.updatedAt=new Date().toISOString(); save();
      await notify(`📦 **Bloodlands order update ${order.id}**\nPlayer: ${order.playerName}\nStatus: ${order.status}\nPayment: ${order.paymentStatus}`);
      return send(res,200,order);
    }
    const filePath=path.join(ROOT,'public',url.pathname==='/'?'index.html':path.normalize(url.pathname).replace(/^([.][.][/\\])+/,''));
    if (!filePath.startsWith(path.join(ROOT,'public'))) return send(res,403,{error:'Forbidden'});
    fs.readFile(filePath,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream'});res.end(data);});
  } catch(e) { console.error(e); send(res,500,{error:'Server error'}); }
});
server.listen(PORT, '0.0.0.0', ()=>console.log(`Bloodlands Trader listening on port ${PORT}`));
