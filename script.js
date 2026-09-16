/* ============================================================
   مهرشاپ — اسکریپت با اتصال به Supabase
   ============================================================ */

const CONFIG = {
  brandName: 'مهرشاپ',
  slogan: 'با مهر بخر، با خیال راحت',
  defaultAdminPass: 'mehrshop123'
};

function $(id){return document.getElementById(id);}
const fmt = n => Number(n||0).toLocaleString('fa-IR');
const load = (k,def)=>{try{return JSON.parse(localStorage.getItem(k)) ?? def;}catch(e){return def;}};
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));

/* ══════════════════════════════════════════════════
   اتصال به Supabase
   ══════════════════════════════════════════════════ */
let supabaseCfg = load('mehr_supabase', {url:'',key:''});
let sb = null;

function initSupabase(){
  if(supabaseCfg.url && supabaseCfg.key && window.supabase){
    try{
      sb = window.supabase.createClient(supabaseCfg.url, supabaseCfg.key);
      return true;
    }catch(e){console.error('Supabase init:', e);}
  }
  return false;
}

/* ══════════════════════════════════════════════════
   داده‌های سراسری
   ══════════════════════════════════════════════════ */
const categories = ['همه','خوراکی','مواد غذایی','بهداشتی و شخصی'];

let products = [];
let orders   = [];
let coupons  = [];
let reviews  = {};

let cart     = load('mehr_cart', {});
let wishlist = load('mehr_wish', []);
let user     = load('mehr_user', null);
let adminAuth = sessionStorage.getItem('mehr_admin')==='1';
let adminPass = load('mehr_adminpass', CONFIG.defaultAdminPass);
let aiCfg     = load('mehr_ai', {key:'',model:'gpt-4o-mini'});

let shopInfo = load('mehr_shopinfo', {
  brand: 'مهرشاپ',
  owner: '',
  slogan: 'با مهر بخر، با خیال راحت',
  phone: '۰۲۱-۱۲۳۴۵۶۷۸',
  email: 'info@mehrshop.ir',
  address: 'تهران',
  instagram: '',
  telegram: '',
  whatsapp: '',
  topBar: '🌞 مهرشاپ | با مهر بخر، با خیال راحت — ارسال رایگان بالای ۵۰۰ هزار تومان',
  story: 'مهرشاپ با یک ایده ساده شروع شد: خرید روزمره باید راحت، سریع و دلنشین باشد. ما باور داریم که «مهر» در هر سفارش جاری است — از لحظه‌ای که سفارش می‌دهی تا لحظه‌ای که بسته به دستت می‌رسد. تیم ما با دقت، کیفیت و سرعت، تجربه‌ای گرم برایت می‌سازد.'
});

let activeCat = 'همه';
let searchQuery = '';
let currentProduct = null;
let activeCoupon = null;
let dbConnected = false;

const saveCart = ()=>save('mehr_cart', cart);
const saveWish = ()=>save('mehr_wish', wishlist);

/* ══════════════════════════════════════════════════
   CRUD Supabase
   ══════════════════════════════════════════════════ */
async function dbLoadAll(){
  if(!sb) return;
  try{
    const [pRes, oRes, cRes, rRes] = await Promise.all([
      sb.from('products').select('*').order('created_at', {ascending:false}),
      sb.from('orders').select('*').order('created_at', {ascending:false}),
      sb.from('coupons').select('*'),
      sb.from('reviews').select('*').order('created_at', {ascending:false})
    ]);
    if(pRes.error) console.error('products:', pRes.error);
    if(oRes.error) console.error('orders:', oRes.error);
    if(cRes.error) console.error('coupons:', cRes.error);
    if(rRes.error) console.error('reviews:', rRes.error);

    products = pRes.data || [];
    orders   = oRes.data || [];
    coupons  = cRes.data || [];
    reviews  = {};
    (rRes.data||[]).forEach(r=>{
      if(!reviews[r.product_id]) reviews[r.product_id] = [];
      reviews[r.product_id].push(r);
    });
  }catch(e){ console.error('dbLoadAll:', e); }
}

async function dbInsertProduct(p){
  if(!sb){alert('اتصال به دیتابیس برقرار نیست.'); return false;}
  const {data, error} = await sb.from('products').insert(p).select();
  if(error){alert('خطا: '+error.message); return false;}
  if(data && data[0]) products.unshift(data[0]);
  return true;
}

async function dbDeleteProduct(id){
  if(!sb) return;
  await sb.from('products').delete().eq('id', id);
  products = products.filter(p=>p.id!==id);
}

async function dbUpdateProduct(id, updates){
  if(!sb) return;
  await sb.from('products').update(updates).eq('id', id);
  const p = products.find(x=>x.id===id);
  if(p) Object.assign(p, updates);
}

async function dbInsertOrder(o){
  if(!sb){alert('اتصال به دیتابیس برقرار نیست.'); return false;}
  const {data, error} = await sb.from('orders').insert(o).select();
  if(error){alert('خطا در ثبت سفارش: '+error.message); return false;}
  if(data && data[0]) orders.unshift(data[0]);
  return true;
}

async function dbInsertCoupon(c){
  if(!sb) return;
  const {data, error} = await sb.from('coupons').insert(c).select();
  if(error){alert('خطا: '+error.message); return;}
  if(data && data[0]) coupons.push(data[0]);
}

async function dbDeleteCoupon(id){
  if(!sb) return;
  await sb.from('coupons').delete().eq('id', id);
  coupons = coupons.filter(c=>c.id!==id);
}

async function dbInsertReview(r){
  if(!sb) return;
  await sb.from('reviews').insert(r);
  if(!reviews[r.product_id]) reviews[r.product_id] = [];
  reviews[r.product_id].unshift(r);
}

/* ══════════════════════════════════════════════════
   اعمال تنظیمات فروشگاه
   ══════════════════════════════════════════════════ */
function applyShopInfo(){
  const s = shopInfo;
  $('brandName').textContent = s.brand || 'فروشگاه';
  document.title = (s.brand || 'فروشگاه') + ' | ' + (s.slogan || '');
  if(s.topBar) $('topBar').textContent = s.topBar;
  $('heroTitle').textContent = (s.slogan || 'خرید آسان') + ' 🌞';
  $('heroSub').textContent = 'خوراکی، مواد غذایی و لوازم بهداشتی — با گرمای مهر در خانه‌ات.';
  $('abTitle').textContent = '🌞 درباره ' + (s.brand || '');
  $('abSlogan').textContent = s.slogan || '';
  if(s.story) $('abStory').textContent = s.story;
  $('ftBrand').textContent = '🌞 ' + (s.brand || 'فروشگاه');
  $('ftSlogan').textContent = (s.slogan || '') + '. فروشگاه آنلاین خوراکی، مواد غذایی و لوازم بهداشتی.';
  $('ftOwner').textContent = s.owner || '—';
  $('ftPhone').textContent = s.phone || '';
  $('ftEmail').textContent = s.email || '';
  $('ftAddress').textContent = s.address || '';
  $('ftCopyBrand').textContent = s.brand || '';
  $('ftCopySlogan').textContent = s.slogan || '';

  if(s.instagram){ $('ftInstaLi').style.display=''; $('ftInsta').textContent=s.instagram; }
  else $('ftInstaLi').style.display='none';
  if(s.telegram){ $('ftTelegramLi').style.display=''; $('ftTelegram').textContent=s.telegram; }
  else $('ftTelegramLi').style.display='none';
  if(s.whatsapp){ $('ftWhatsappLi').style.display=''; $('ftWhatsapp').textContent=s.whatsapp; }
  else $('ftWhatsappLi').style.display='none';

  $('ctOwner').textContent = s.owner ? '👤 صاحب فروشگاه: ' + s.owner : '';
  $('ctPhone').textContent = s.phone || '';
  $('ctEmail').textContent = s.email || '';
  $('ctAddress').textContent = s.address || '';
  $('ctInsta').innerHTML = s.instagram ? '📷 اینستاگرام: ' + s.instagram : '';
  $('ctTelegram').innerHTML = s.telegram ? '✈️ تلگرام: ' + s.telegram : '';
  $('ctWhatsapp').innerHTML = s.whatsapp ? '💬 واتساپ: ' + s.whatsapp : '';

  const chatHead = document.querySelector('.chat-head span');
  if(chatHead) chatHead.textContent = '🌞 دستیار ' + (s.brand || 'فروشگاه');
}

function saveShopInfo(){
  shopInfo = {
    brand:     $('siBrand').value.trim() || 'فروشگاه',
    owner:     $('siOwner').value.trim(),
    slogan:    $('siSlogan').value.trim(),
    phone:     $('siPhone').value.trim(),
    email:     $('siEmail').value.trim(),
    address:   $('siAddress').value.trim(),
    instagram: $('siInsta').value.trim(),
    telegram:  $('siTelegram').value.trim(),
    whatsapp:  $('siWhatsapp').value.trim(),
    topBar:    $('siTopBar').value.trim(),
    story:     $('siStory').value.trim()
  };
  save('mehr_shopinfo', shopInfo);
  applyShopInfo();
  $('siStatus').textContent = '✅ اطلاعات فروشگاه ذخیره شد.';
}

/* ══════════════════════════════════════════════════
   ناوبری
   ══════════════════════════════════════════════════ */
function go(page){
  if(page==='admin' && !adminAuth){ page='adminLogin'; }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = $('page-'+page);
  if(el) el.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='admin') renderAdmin();
  if(page==='wish') renderWishlist();
}
function scrollToProducts(){ $('productsSection').scrollIntoView({behavior:'smooth'}); }

/* ══════════════════════════════════════════════════
   دسته‌بندی
   ══════════════════════════════════════════════════ */
function renderCategories(){
  $('categories').innerHTML = categories.map(c=>
    `<button class="${c===activeCat?'active':''}" data-cat="${c}">${c}</button>`
  ).join('');
  document.querySelectorAll('#categories button').forEach(b=>{
    b.onclick = ()=>{
      activeCat = b.dataset.cat;
      renderCategories(); renderProducts(); go('home');
    };
  });
}
function setCat(c){activeCat=c;renderCategories();renderProducts();go('home');}

/* ══════════════════════════════════════════════════
   محصولات
   ══════════════════════════════════════════════════ */
function productAvgStars(id){
  const list = reviews[id] || [];
  if(!list.length) return 0;
  return list.reduce((s,r)=>s+(r.stars||0),0)/list.length;
}

function renderProducts(){
  const filtered = products.filter(p=>{
    const mCat = activeCat==='همه' || p.cat===activeCat;
    const mSearch = (p.name||'').includes(searchQuery.trim());
    return mCat && mSearch;
  });

  if(products.length===0){
    $('products').innerHTML = '';
    $('emptyState').style.display = 'block';
    $('resultCount').textContent = '';
    return;
  }
  $('emptyState').style.display = 'none';
  $('resultCount').textContent = `${fmt(filtered.length)} محصول`;

  if(filtered.length === 0){
    $('products').innerHTML = '<p style="color:#777;">محصولی پیدا نشد.</p>';
    return;
  }

  $('products').innerHTML = filtered.map(p=>{
    const avg = productAvgStars(p.id);
    const stars = avg ? '⭐'.repeat(Math.round(avg)) : '';
    const wished = wishlist.includes(p.id) ? '❤️' : '🤍';
    const stockTag = p.stock<=0 ? '<span class="tag warn">ناموجود</span>'
                    : p.stock<5 ? '<span class="tag info">آخرین موجودی</span>' : '';
    return `
      <div class="card" data-id="${p.id}">
        <div class="thumb">
          ${p.emoji||'📦'}
          <button class="wish" onclick="event.stopPropagation();toggleWish(${p.id})">${wished}</button>
        </div>
        <h4>${p.name}</h4>
        <div class="cat">${p.cat} ${stockTag}</div>
        <div class="stars">${stars}</div>
        <div class="price">${fmt(p.price)} تومان</div>
        <button class="add" onclick="event.stopPropagation();addToCart(${p.id})">افزودن به سبد</button>
      </div>`;
  }).join('');

  document.querySelectorAll('.card').forEach(c=>{
    c.onclick = ()=>showProduct(Number(c.dataset.id));
  });
}

async function showProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  currentProduct = id;

  // افزایش بازدید در DB
  p.views = (p.views||0) + 1;
  dbUpdateProduct(id, {views: p.views});

  const avg = productAvgStars(id);
  const stars = avg ? '⭐'.repeat(Math.round(avg)) + ` (${avg.toFixed(1)})` : 'بدون امتیاز';
  const wished = wishlist.includes(id) ? '❤️ در علاقه‌مندی' : '🤍 افزودن به علاقه‌مندی';

  $('productDetail').innerHTML = `
    <div class="thumb">${p.emoji||'📦'}</div>
    <div>
      <h2>${p.name}</h2>
      <div class="cat">دسته: ${p.cat} | موجودی: ${fmt(p.stock||0)}</div>
      <div class="stars">${stars}</div>
      <p>${p.desc || 'بدون توضیحات.'}</p>
      <div class="price">${fmt(p.price)} تومان</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" onclick="addToCart(${p.id});openCart();">🛒 افزودن به سبد</button>
        <button class="btn btn-outline" onclick="toggleWish(${p.id});showProduct(${p.id});">${wished}</button>
      </div>
    </div>`;
  renderReviews(id);
  go('product');
}

/* ══════════════════════════════════════════════════
   نظرات
   ══════════════════════════════════════════════════ */
function renderReviews(id){
  const list = reviews[id]||[];
  if(!list.length){
    $('reviewsList').innerHTML = '<p style="color:#6b7280;font-size:.85rem;">هنوز نظری ثبت نشده.</p>';
    return;
  }
  $('reviewsList').innerHTML = list.map(r=>`
    <div style="border-bottom:1px solid #eee;padding:8px 0;font-size:.85rem;">
      <div style="font-weight:bold;">${r.user_name||'کاربر'} <span class="stars">${'⭐'.repeat(r.stars||0)}</span></div>
      <div>${r.text}</div>
      <div style="font-size:.72rem;color:#9ca3af;">${r.date||''}</div>
    </div>`).join('');
}

async function submitReview(){
  if(!currentProduct) return;
  const stars = Number($('revStars').value);
  const text = $('revText').value.trim();
  if(!text){alert('متن نظر را بنویس.');return;}

  const r = {
    product_id: currentProduct,
    user_name: user ? user.name : 'مهمان',
    stars,
    text,
    date: new Date().toLocaleDateString('fa-IR')
  };
  await dbInsertReview(r);
  $('revText').value = '';
  renderReviews(currentProduct);
  alert('نظر ثبت شد ✅');
}

/* ══════════════════════════════════════════════════
   علاقه‌مندی
   ══════════════════════════════════════════════════ */
function toggleWish(id){
  const i = wishlist.indexOf(id);
  if(i>-1) wishlist.splice(i,1); else wishlist.push(id);
  saveWish(); updateWishCount(); renderProducts();
}
function updateWishCount(){ $('wishCount').textContent = fmt(wishlist.length); }

function renderWishlist(){
  const items = products.filter(p=>wishlist.includes(p.id));
  if(!items.length){
    $('wishList').innerHTML = '<p style="color:#6b7280;">لیست علاقه‌مندی خالی است.</p>';
    return;
  }
  $('wishList').innerHTML = items.map(p=>`
    <div class="card" onclick="showProduct(${p.id})">
      <div class="thumb">${p.emoji||'📦'}</div>
      <h4>${p.name}</h4>
      <div class="cat">${p.cat}</div>
      <div class="price">${fmt(p.price)} تومان</div>
      <button class="add" onclick="event.stopPropagation();addToCart(${p.id})">افزودن به سبد</button>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════
   سبد خرید
   ══════════════════════════════════════════════════ */
function addToCart(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  if((p.stock||0)<=0){alert('این محصول ناموجود است.');return;}
  cart[id] = (cart[id]||0) + 1;
  updateCart();
}
function changeQty(id,delta){
  cart[id] = (cart[id]||0) + delta;
  if(cart[id]<=0) delete cart[id];
  updateCart();
}
function updateCart(){
  let count=0,total=0;
  Object.keys(cart).forEach(id=>{
    const p = products.find(x=>x.id===Number(id));
    if(!p) return;
    count += cart[id];
    total += p.price * cart[id];
  });
  $('cartCount').textContent = fmt(count);
  $('cartTotal').textContent = fmt(total)+' تومان';

  if(activeCoupon){
    const disc = Math.round(total * activeCoupon.percent / 100);
    $('discountRow').style.display = 'flex';
    $('discountVal').textContent = fmt(disc)+' تومان';
  } else {
    $('discountRow').style.display = 'none';
  }
  saveCart();
  renderCartItems();
}
function renderCartItems(){
  const ids = Object.keys(cart);
  if(!ids.length){
    $('cartItems').innerHTML = '<div class="empty-cart"><div class="big">🛍️</div><p>سبد خرید خالی است.</p></div>';
    return;
  }
  $('cartItems').innerHTML = ids.map(id=>{
    const p = products.find(x=>x.id===Number(id));
    if(!p) return '';
    return `
      <div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid #eee;padding:10px 0;">
        <div style="font-size:1.6rem;">${p.emoji||'📦'}</div>
        <div style="flex:1;">
          <div style="font-size:.88rem;font-weight:bold;">${p.name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <button onclick="changeQty(${id},-1)" style="width:26px;height:26px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;">−</button>
            <span>${fmt(cart[id])}</span>
            <button onclick="changeQty(${id},1)" style="width:26px;height:26px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;">+</button>
          </div>
        </div>
        <div style="font-weight:bold;color:var(--primary-dark);">${fmt(p.price*cart[id])}</div>
      </div>`;
  }).join('');
}
function openCart(){$('cartPanel').classList.add('open');$('overlay').classList.add('show');}
function closeCart(){$('cartPanel').classList.remove('open');$('overlay').classList.remove('show');}

function applyCoupon(){
  const code = $('couponInput').value.trim().toUpperCase();
  const c = coupons.find(x=>(x.code||'').toUpperCase()===code);
  if(!c){alert('کد تخفیف معتبر نیست.');return;}
  activeCoupon = c;
  updateCart();
  alert(`کد ${c.percent}٪ اعمال شد ✅`);
}

/* ══════════════════════════════════════════════════
   ثبت سفارش
   ══════════════════════════════════════════════════ */
async function checkout(){
  const ids = Object.keys(cart);
  if(!ids.length){alert('سبد خرید خالی است.');return;}

  let total = 0;
  const items = [];
  const productUpdates = [];

  ids.forEach(id=>{
    const p = products.find(x=>x.id===Number(id));
    if(!p) return;
    const qty = cart[id];
    total += p.price*qty;
    items.push({id:p.id, name:p.name, price:p.price, qty});
    productUpdates.push({
      id: p.id,
      sold: (p.sold||0) + qty,
      stock: Math.max(0, (p.stock||0) - qty)
    });
  });

  let discount = 0;
  if(activeCoupon) discount = Math.round(total * activeCoupon.percent/100);
  const finalTotal = total - discount;

  const order = {
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    user_name: user ? user.name : 'مهمان',
    items,
    total: finalTotal,
    discount
  };

  const ok = await dbInsertOrder(order);
  if(!ok) return;

  // آپدیت محصولات در DB
  for(const u of productUpdates){
    await dbUpdateProduct(u.id, {sold:u.sold, stock:u.stock});
  }

  cart = {}; activeCoupon = null;
  $('couponInput').value = '';
  saveCart(); updateCart(); closeCart(); renderProducts();
  alert(`سفارش ثبت شد ✅\nمبلغ قابل پرداخت: ${fmt(finalTotal)} تومان`);
}

/* ══════════════════════════════════════════════════
   پنل مدیریت
   ══════════════════════════════════════════════════ */
function loginAdmin(){
  const pass = $('adminPass').value;
  if(pass === adminPass){
    adminAuth = true;
    sessionStorage.setItem('mehr_admin','1');
    $('adminPass').value = '';
    go('admin');
  } else {
    alert('رمز اشتباه است.');
  }
}
function logoutAdmin(){
  adminAuth = false;
  sessionStorage.removeItem('mehr_admin');
  go('home');
}
function changeAdminPass(){
  const np = $('newAdminPass').value.trim();
  if(np.length < 6){alert('رمز باید حداقل ۶ کاراکتر باشد.');return;}
  adminPass = np; save('mehr_adminpass', np);
  $('newAdminPass').value = '';
  alert('رمز با موفقیت تغییر کرد ✅');
}

function renderAdmin(){
  const totalRevenue = orders.reduce((s,o)=>s+(o.total||0),0);
  const totalOrders = orders.length;
  const totalSold = products.reduce((s,p)=>s+(p.sold||0),0);
  const totalViews = products.reduce((s,p)=>s+(p.views||0),0);
  const totalWish  = products.reduce((s,p)=>s+((wishlist.includes(p.id))?1:0),0);

  $('statsGrid').innerHTML = `
    <div class="stat-card"><div class="label">💰 درآمد کل</div>
      <div class="value">${fmt(totalRevenue)}</div><div class="sub">تومان</div></div>
    <div class="stat-card"><div class="label">🧾 سفارش‌ها</div>
      <div class="value">${fmt(totalOrders)}</div><div class="sub">سفارش موفق</div></div>
    <div class="stat-card"><div class="label">📦 فروش کل</div>
      <div class="value">${fmt(totalSold)}</div><div class="sub">قلم کالا</div></div>
    <div class="stat-card"><div class="label">👁️ بازدید کل</div>
      <div class="value">${fmt(totalViews)}</div><div class="sub">بار مشاهده</div></div>
    <div class="stat-card"><div class="label">❤️ علاقه‌مندی</div>
      <div class="value">${fmt(totalWish)}</div><div class="sub">محصول لایک‌شده</div></div>
    <div class="stat-card"><div class="label">🎯 میانگین سفارش</div>
      <div class="value">${fmt(totalOrders?Math.round(totalRevenue/totalOrders):0)}</div>
      <div class="sub">تومان</div></div>`;

  const sortedBySold = [...products].sort((a,b)=>(b.sold||0)-(a.sold||0));
  const maxSold = Math.max(1, sortedBySold[0]?.sold||1);
  $('topSellers').innerHTML = sortedBySold.slice(0,5).map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${p.name}</div>
      <div class="bar"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)} فروش</div>
    </div>`).join('') || '<p style="color:#6b7280;font-size:.85rem;">داده‌ای نیست.</p>';

  const lowSellers = [...products].sort((a,b)=>(a.sold||0)-(b.sold||0)).slice(0,5);
  $('lowSellers').innerHTML = lowSellers.map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${p.name}</div>
      <div class="bar bad"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)} فروش</div>
    </div>`).join('') || '<p style="color:#6b7280;font-size:.85rem;">داده‌ای نیست.</p>';

  const sortedByViews = [...products].sort((a,b)=>(b.views||0)-(a.views||0));
  const maxViews = Math.max(1, sortedByViews[0]?.views||1);
  $('topViewed').innerHTML = sortedByViews.slice(0,5).map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${p.name}</div>
      <div class="bar"><span style="width:${((p.views||0)/maxViews)*100}%"></span></div>
      <div class="val">${fmt(p.views||0)} بازدید</div>
    </div>`).join('') || '<p style="color:#6b7280;font-size:.85rem;">داده‌ای نیست.</p>';

  const wishCounts = products.map(p=>({p, count: wishlist.includes(p.id)?1:0}))
    .filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
  $('topWished').innerHTML = wishCounts.length ? wishCounts.map(x=>`
    <div class="bar-row">
      <div class="name">${x.p.emoji||'📦'} ${x.p.name}</div>
      <div class="bar"><span style="width:100%"></span></div>
      <div class="val">${fmt(x.count)} علاقه‌مندی</div>
    </div>`).join('') : '<p style="color:#6b7280;font-size:.85rem;">داده‌ای نیست.</p>';

  if(!products.length){
    $('adminList').innerHTML = '<tr><td colspan="9" style="text-align:center;color:#6b7280;">هنوز محصولی نیست.</td></tr>';
  } else {
    $('adminList').innerHTML = products.map(p=>{
      const avg = productAvgStars(p.id);
      return `
        <tr>
          <td style="font-size:1.4rem;">${p.emoji||'📦'}</td>
          <td>${p.name}</td>
          <td>${p.cat}</td>
          <td>${fmt(p.price)}</td>
          <td>${fmt(p.stock||0)}</td>
          <td>${fmt(p.views||0)}</td>
          <td>${fmt(p.sold||0)}</td>
          <td>${avg?avg.toFixed(1):'—'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="editStock(${p.id})">موجودی</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">حذف</button>
          </td>
        </tr>`;
    }).join('');
  }

  if(!orders.length){
    $('ordersList').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280;">سفارشی ثبت نشده.</td></tr>';
  } else {
    $('ordersList').innerHTML = orders.map((o,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${o.date||''}</td>
        <td>${o.user_name||''}</td>
        <td>${(o.items||[]).reduce((s,x)=>s+(x.qty||0),0)}</td>
        <td>${fmt(o.total)} تومان</td>
      </tr>`).join('');
  }

  if(!coupons.length){
    $('couponsList').innerHTML = '<p style="color:#6b7280;font-size:.85rem;">کدی ثبت نشده.</p>';
  } else {
    $('couponsList').innerHTML = coupons.map(c=>`
      <div class="tag" style="margin:4px;font-size:.85rem;padding:5px 12px;">
        ${c.code} — ${c.percent}٪
        <button onclick="deleteCoupon(${c.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;">×</button>
      </div>`).join('');
  }

  // تنظیمات فروشگاه
  $('siBrand').value    = shopInfo.brand || '';
  $('siOwner').value    = shopInfo.owner || '';
  $('siSlogan').value   = shopInfo.slogan || '';
  $('siPhone').value    = shopInfo.phone || '';
  $('siEmail').value    = shopInfo.email || '';
  $('siAddress').value  = shopInfo.address || '';
  $('siInsta').value    = shopInfo.instagram || '';
  $('siTelegram').value = shopInfo.telegram || '';
  $('siWhatsapp').value = shopInfo.whatsapp || '';
  $('siTopBar').value   = shopInfo.topBar || '';
  $('siStory').value    = shopInfo.story || '';
  $('siStatus').textContent = '';

  // Supabase status
  $('sbUrl').value = supabaseCfg.url || '';
  $('sbKey').value = supabaseCfg.key || '';
  $('sbStatus').textContent = dbConnected ? '✅ متصل به سوپابیس' : '⚠️ به سوپابیس متصل نیست';
  $('sbStatus').style.color = dbConnected ? '#16A34A' : '#D97706';

  $('aiKey').value = aiCfg.key || '';
  $('aiModel').value = aiCfg.model || 'gpt-4o-mini';
}

async function addProduct(){
  const name = $('pName').value.trim();
  const price = Number($('pPrice').value);
  const stock = Number($('pStock').value)||0;
  if(!name || !price){alert('نام و قیمت را وارد کن.');return;}

  const p = {
    id: Date.now(),
    name, price, stock,
    cat: $('pCat').value,
    emoji: $('pEmoji').value.trim() || '📦',
    desc: $('pDesc').value.trim(),
    views:0, sold:0
  };
  const ok = await dbInsertProduct(p);
  if(!ok) return;

  $('pName').value = $('pPrice').value = $('pEmoji').value = $('pDesc').value = '';
  renderProducts(); renderAdmin();
  alert('محصول اضافه شد ✅');
}

async function deleteProduct(id){
  if(!confirm('این محصول حذف شود؟')) return;
  await dbDeleteProduct(id);
  renderProducts(); renderAdmin(); updateCart();
}

async function editStock(id){
  const p = products.find(x=>x.id===id);
  const val = prompt('موجودی جدید:', p.stock||0);
  if(val===null) return;
  await dbUpdateProduct(id, {stock: Number(val)||0});
  renderAdmin();
}

async function addCoupon(){
  const code = $('cpCode').value.trim().toUpperCase();
  const percent = Number($('cpPercent').value);
  if(!code || !percent){alert('کد و درصد را وارد کن.');return;}
  await dbInsertCoupon({code, percent, active:true});
  $('cpCode').value=''; $('cpPercent').value='';
  renderAdmin();
}

async function deleteCoupon(id){
  await dbDeleteCoupon(id);
  renderAdmin();
}

function saveSupabase(){
  supabaseCfg = {url:$('sbUrl').value.trim(), key:$('sbKey').value.trim()};
  save('mehr_supabase', supabaseCfg);
  initSupabase();
  $('sbStatus').textContent = '✅ تنظیمات ذخیره شد. صفحه را رفرش کن.';
  $('sbStatus').style.color = '#16A34A';
}

async function testSupabase(){
  if(!supabaseCfg.url || !supabaseCfg.key){
    $('sbStatus').textContent = '❌ اول تنظیمات را ذخیره کن.';
    $('sbStatus').style.color = '#dc2626'; return;
  }
  if(!sb) initSupabase();
  if(!sb){
    $('sbStatus').textContent = '❌ کتابخانه سوپابیس لود نشده.';
    $('sbStatus').style.color = '#dc2626'; return;
  }
  try{
    const {error} = await sb.from('products').select('id').limit(1);
    if(error){
      $('sbStatus').textContent = '⚠️ خطا: ' + error.message;
      $('sbStatus').style.color = '#D97706';
    } else {
      dbConnected = true;
      $('sbStatus').textContent = '✅ اتصال به سوپابیس برقرار است.';
      $('sbStatus').style.color = '#16A34A';
    }
  }catch(e){
    $('sbStatus').textContent = '❌ خطا: ' + e.message;
    $('sbStatus').style.color = '#dc2626';
  }
}

function saveAI(){
  aiCfg = {key:$('aiKey').value.trim(), model:$('aiModel').value};
  save('mehr_ai', aiCfg);
  $('aiStatus').textContent = '✅ تنظیمات هوش مصنوعی ذخیره شد.';
  $('aiStatus').style.color = '#16A34A';
}

function resetAll(){
  if(!confirm('همه داده‌ها پاک شوند؟')) return;
  ['mehr_cart','mehr_wish','mehr_user']
    .forEach(k=>localStorage.removeItem(k));
  location.reload();
}

/* ══════════════════════════════════════════════════
   ورود / ثبت‌نام
   ══════════════════════════════════════════════════ */
function openAuth(){
  if(user){
    if(confirm(`از حساب ${user.name} خارج می‌شوی؟`)){
      user = null; localStorage.removeItem('mehr_user'); updateUserBtn();
    }
    return;
  }
  $('authModal').classList.add('open');
}
function closeAuth(){$('authModal').classList.remove('open');}
function switchAuth(m){
  if(m==='register'){
    $('loginForm').style.display='none';
    $('registerForm').style.display='block';
    $('authTitle').textContent='ثبت‌نام';
  } else {
    $('loginForm').style.display='block';
    $('registerForm').style.display='none';
    $('authTitle').textContent='ورود به حساب';
  }
}
function doLogin(){
  const email = $('loginEmail').value.trim();
  if(!email){alert('ایمیل را وارد کن.');return;}
  user = {name:email.split('@')[0],email};
  save('mehr_user',user); updateUserBtn(); closeAuth();
  alert('خوش آمدی '+user.name+' 🌞');
}
function doRegister(){
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass = $('regPass').value;
  if(!name||!email||!pass){alert('همه فیلدها را پر کن.');return;}
  user = {name,email};
  save('mehr_user',user); updateUserBtn(); closeAuth();
  alert('ثبت‌نام موفق ✅ خوش آمدی '+name);
}
function updateUserBtn(){
  $('userBtn').textContent = user ? '👤 '+user.name : 'ورود';
}

/* ══════════════════════════════════════════════════
   ربات
   ══════════════════════════════════════════════════ */
const BOT_RULES = [
  {keys:['سلام','درود','وقت بخیر','hi','hello'],
   reply:()=>'سلام 🌞 به '+(shopInfo.brand||'فروشگاه')+' خوش آمدی. چطور می‌تونم کمکت کنم؟'},
  {keys:['قیمت','چند','هزینه'],
   reply:()=>{
     if(!products.length) return 'هنوز محصولی ثبت نشده.';
     const list = products.slice(0,5).map(p=>`• ${p.name}: ${fmt(p.price)} تومان`).join('\n');
     return 'چند نمونه:\n'+list;
   }},
  {keys:['ارسال','پست','چند روز'],
   reply:()=>'🚚 تهران: ۱ روز کاری، شهرستان: ۲ تا ۴ روز کاری.'},
  {keys:['تخفیف','کد','کوپن'],
   reply:()=>coupons.length
     ? 'کدهای فعال:\n'+coupons.map(c=>`🎟️ ${c.code} → ${c.percent}٪`).join('\n')
     : 'فعلاً کد تخفیف فعالی نداریم 💛'},
  {keys:['پیگیری','سفارش من'],
   reply:()=>orders.length
     ? `📦 شما ${fmt(orders.length)} سفارش داری.`
     : 'هنوز سفارشی ثبت نکردی.'},
  {keys:['ساعت','کاری'],
   reply:()=>'🕘 هر روز ۹ صبح تا ۹ شب.'},
  {keys:['گارانتی','ضمانت'],
   reply:()=>'✅ ضمانت اصالت و ۷ روز مرجوعی.'},
  {keys:['پیشنهاد','پرفروش'],
   reply:()=>{
     const top = [...products].sort((a,b)=>(b.sold||0)-(a.sold||0)).slice(0,3);
     if(!top.length || !top[0].sold) return 'هنوز فروشی ثبت نشده.';
     return '🔥 پرفروش‌ها:\n'+top.map(p=>`• ${p.name}`).join('\n');
   }},
  {keys:['موجود'],
   reply:()=>{
     const inStock = products.filter(p=>(p.stock||0)>0).slice(0,5);
     if(!inStock.length) return 'فعلاً موجودی ثبت نشده.';
     return '✅ موجود:\n'+inStock.map(p=>`• ${p.name} (${fmt(p.stock)})`).join('\n');
   }},
  {keys:['تماس','شماره','تلفن'],
   reply:()=>'📞 '+(shopInfo.phone||'')+'\n✉️ '+(shopInfo.email||'')},
  {keys:['درباره'],
   reply:()=>(shopInfo.brand||'فروشگاه')+' — شعار: '+(shopInfo.slogan||'')},
  {keys:['ممنون','مرسی'],
   reply:()=>'خواهش می‌کنم 💛'},
  {keys:['خداحافظ','بای'],
   reply:()=>'خدانگهدار 🌞'}
];

function localBotReply(text){
  const t = text.toLowerCase();
  for(const r of BOT_RULES){
    if(r.keys.some(k=>t.includes(k))) return r.reply();
  }
  return 'متأسفم متوجه نشدم 🤔';
}

async function aiBotReply(text){
  if(!aiCfg.key) return null;
  try{
    const sys = `دستیار فروشگاه «${shopInfo.brand}». پاسخ کوتاه و گرم به فارسی.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+aiCfg.key},
      body: JSON.stringify({
        model: aiCfg.model || 'gpt-4o-mini',
        messages:[{role:'system',content:sys},{role:'user',content:text}],
        max_tokens: 250,
        temperature: 0.7
      })
    });
    const data = await res.json();
    if(data.choices && data.choices[0]) return data.choices[0].message.content;
    return null;
  }catch(e){ return null; }
}

async function botReply(text){
  const ai = await aiBotReply(text);
  return ai || localBotReply(text);
}

function toggleChat(){
  $('chatBox').classList.toggle('open');
  if($('chatBox').classList.contains('open') && !$('chatBody').innerHTML){
    pushBot('سلام 🌞 من دستیار '+(shopInfo.brand||'فروشگاه')+'م.');
    quickReplies(['قیمت‌ها','زمان ارسال','کد تخفیف','پیشنهاد خرید']);
  }
}
function pushUser(text){
  $('chatBody').innerHTML += `<div class="msg user">${text}</div>`;
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
function pushBot(text){
  $('chatBody').innerHTML += `<div class="msg bot">${text.replace(/\n/g,'<br>')}</div>`;
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
function quickReplies(list){
  $('chatBody').innerHTML += `<div class="quick-replies">${
    list.map(q=>`<button onclick="sendQuick('${q}')">${q}</button>`).join('')
  }</div>`;
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
async function sendQuick(t){
  pushUser(t);
  pushBot('...');
  const reply = await botReply(t);
  const last = $('chatBody').lastElementChild;
  if(last && last.textContent==='...') last.remove();
  pushBot(reply);
}
async function sendChat(){
  const v = $('chatInput').value.trim();
  if(!v) return;
  pushUser(v);
  $('chatInput').value = '';
  pushBot('...');
  const reply = await botReply(v);
  const last = $('chatBody').lastElementChild;
  if(last && last.textContent==='...') last.remove();
  pushBot(reply);
}

/* ══════════════════════════════════════════════════
   راه‌اندازی
   ══════════════════════════════════════════════════ */
async function init(){
  initSupabase();
  dbConnected = !!sb;

  if(dbConnected){
    await dbLoadAll();
  }

  applyShopInfo();
  renderCategories();
  renderProducts();
  updateCart();
  updateWishCount();
  updateUserBtn();

  $('search').addEventListener('input',e=>{
    searchQuery = e.target.value; renderProducts(); go('home');
  });
  $('cartBtn').onclick = openCart;
  $('wishBtn').onclick = ()=>go('wish');
  $('userBtn').onclick = openAuth;
  $('checkout').onclick = checkout;
}

init();
