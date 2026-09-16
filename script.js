/* ============================================================
   مهرشاپ — اسکریپت اصلی
   ============================================================ */

const CONFIG = {
  brandName: 'مهرشاپ',
  slogan: 'با مهر بخر، با خیال راحت',
  primary: '#D97706',
  primaryDark: '#92400E',
  accent: '#16A34A',
  defaultAdminPass: 'mehrshop123'
};

function $(id){return document.getElementById(id);}
const fmt = n => Number(n||0).toLocaleString('fa-IR');
const load = (k,def)=>{try{return JSON.parse(localStorage.getItem(k)) ?? def;}catch(e){return def;}};
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));

const categories = ['همه','خوراکی','مواد غذایی','بهداشتی و شخصی'];

let products  = load('mehr_products', []);
let cart      = load('mehr_cart', {});
let wishlist  = load('mehr_wish', []);
let orders    = load('mehr_orders', []);
let coupons   = load('mehr_coupons', []);
let user      = load('mehr_user', null);
let reviews   = load('mehr_reviews', {});
let adminAuth = sessionStorage.getItem('mehr_admin')==='1';
let adminPass = load('mehr_adminpass', CONFIG.defaultAdminPass);
let supabaseCfg = load('mehr_supabase', {url:'',key:''});
let aiCfg       = load('mehr_ai', {key:'',model:'gpt-4o-mini'});

let activeCat = 'همه';
let searchQuery = '';
let currentProduct = null;
let activeCoupon = null;

const saveProducts = ()=>save('mehr_products',products);
const saveOrders   = ()=>save('mehr_orders',orders);
const saveCoupons  = ()=>save('mehr_coupons',coupons);
const saveReviews  = ()=>save('mehr_reviews',reviews);
const saveWish     = ()=>save('mehr_wish',wishlist);
const saveCart     = ()=>save('mehr_cart',cart);

/* ناوبری */
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

/* دسته‌بندی */
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

/* محصولات */
function productAvgStars(id){
  const list = reviews[id] || [];
  if(!list.length) return 0;
  return list.reduce((s,r)=>s+r.stars,0)/list.length;
}

function renderProducts(){
  const filtered = products.filter(p=>{
    const mCat = activeCat==='همه' || p.cat===activeCat;
    const mSearch = p.name.includes(searchQuery.trim());
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

/* جزئیات محصول */
function showProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  currentProduct = id;

  p.views = (p.views||0) + 1;
  saveProducts();

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

/* نظرات */
function renderReviews(id){
  const list = reviews[id]||[];
  if(!list.length){
    $('reviewsList').innerHTML = '<p style="color:#6b7280;font-size:.85rem;">هنوز نظری ثبت نشده.</p>';
    return;
  }
  $('reviewsList').innerHTML = list.map(r=>`
    <div style="border-bottom:1px solid #eee;padding:8px 0;font-size:.85rem;">
      <div style="font-weight:bold;">${r.user||'کاربر'} <span class="stars">${'⭐'.repeat(r.stars)}</span></div>
      <div>${r.text}</div>
      <div style="font-size:.72rem;color:#9ca3af;">${r.date}</div>
    </div>`).join('');
}
function submitReview(){
  if(!currentProduct) return;
  const stars = Number($('revStars').value);
  const text = $('revText').value.trim();
  if(!text){alert('متن نظر را بنویس.');return;}
  if(!reviews[currentProduct]) reviews[currentProduct]=[];
  reviews[currentProduct].push({
    stars, text,
    user: user ? user.name : 'مهمان',
    date: new Date().toLocaleDateString('fa-IR')
  });
  saveReviews();
  $('revText').value = '';
  renderReviews(currentProduct);
  alert('نظر ثبت شد ✅');
}

/* علاقه‌مندی */
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

/* سبد خرید */
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
  const c = coupons.find(x=>x.code===code);
  if(!c){alert('کد تخفیف معتبر نیست.');return;}
  activeCoupon = c;
  updateCart();
  alert(`کد ${c.percent}٪ اعمال شد ✅`);
}

/* ثبت سفارش */
function checkout(){
  const ids = Object.keys(cart);
  if(!ids.length){alert('سبد خرید خالی است.');return;}

  let total = 0;
  const items = ids.map(id=>{
    const p = products.find(x=>x.id===Number(id));
    const qty = cart[id];
    total += p.price*qty;
    p.sold = (p.sold||0) + qty;
    p.stock = Math.max(0,(p.stock||0) - qty);
    return {id:p.id, name:p.name, price:p.price, qty};
  });

  let discount = 0;
  if(activeCoupon) discount = Math.round(total * activeCoupon.percent/100);
  const finalTotal = total - discount;

  orders.push({
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    user: user ? user.name : 'مهمان',
    items, total: finalTotal, discount
  });
  saveOrders();
  saveProducts();

  cart = {}; activeCoupon = null;
  $('couponInput').value = '';
  saveCart(); updateCart(); closeCart();
  alert(`سفارش ثبت شد ✅\nمبلغ قابل پرداخت: ${fmt(finalTotal)} تومان`);
}

/* پنل مدیریت */
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
  const totalRevenue = orders.reduce((s,o)=>s+o.total,0);
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
    $('ordersList').innerHTML = orders.slice().reverse().map((o,i)=>`
      <tr>
        <td>${orders.length-i}</td>
        <td>${o.date}</td>
        <td>${o.user}</td>
        <td>${o.items.reduce((s,x)=>s+x.qty,0)}</td>
        <td>${fmt(o.total)} تومان</td>
      </tr>`).join('');
  }

  if(!coupons.length){
    $('couponsList').innerHTML = '<p style="color:#6b7280;font-size:.85rem;">کدی ثبت نشده.</p>';
  } else {
    $('couponsList').innerHTML = coupons.map((c,i)=>`
      <div class="tag" style="margin:4px;font-size:.85rem;padding:5px 12px;">
        ${c.code} — ${c.percent}٪
        <button onclick="deleteCoupon(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;">×</button>
      </div>`).join('');
  }

  $('sbUrl').value = supabaseCfg.url || '';
  $('sbKey').value = supabaseCfg.key || '';
  $('aiKey').value = aiCfg.key || '';
  $('aiModel').value = aiCfg.model || 'gpt-4o-mini';
}

function addProduct(){
  const name = $('pName').value.trim();
  const price = Number($('pPrice').value);
  const stock = Number($('pStock').value)||0;
  if(!name || !price){alert('نام و قیمت را وارد کن.');return;}

  products.push({
    id: Date.now(),
    name, price, stock,
    cat: $('pCat').value,
    emoji: $('pEmoji').value.trim() || '📦',
    desc: $('pDesc').value.trim(),
    views:0, sold:0
  });
  saveProducts();
  $('pName').value = $('pPrice').value = $('pEmoji').value = $('pDesc').value = '';
  renderProducts(); renderAdmin();
  alert('محصول اضافه شد ✅');
}
function deleteProduct(id){
  if(!confirm('این محصول حذف شود؟')) return;
  products = products.filter(p=>p.id!==id);
  saveProducts(); renderProducts(); renderAdmin(); updateCart();
}
function editStock(id){
  const p = products.find(x=>x.id===id);
  const val = prompt('موجودی جدید:', p.stock||0);
  if(val===null) return;
  p.stock = Number(val)||0;
  saveProducts(); renderAdmin();
}
function addCoupon(){
  const code = $('cpCode').value.trim().toUpperCase();
  const percent = Number($('cpPercent').value);
  if(!code || !percent){alert('کد و درصد را وارد کن.');return;}
  coupons.push({code,percent});
  saveCoupons(); $('cpCode').value=''; $('cpPercent').value='';
  renderAdmin();
}
function deleteCoupon(i){coupons.splice(i,1);saveCoupons();renderAdmin();}

function saveSupabase(){
  supabaseCfg = {url:$('sbUrl').value.trim(), key:$('sbKey').value.trim()};
  save('mehr_supabase', supabaseCfg);
  $('sbStatus').textContent = '✅ تنظیمات ذخیره شد.';
  $('sbStatus').style.color = '#16A34A';
}
async function testSupabase(){
  if(!supabaseCfg.url || !supabaseCfg.key){
    $('sbStatus').textContent = '❌ اول تنظیمات را ذخیره کن.';
    $('sbStatus').style.color = '#dc2626'; return;
  }
  try{
    const res = await fetch(supabaseCfg.url + '/rest/v1/', {
      headers:{ 'apikey':supabaseCfg.key, 'Authorization':'Bearer '+supabaseCfg.key }
    });
    if(res.ok || res.status===404){
      $('sbStatus').textContent = '✅ اتصال به Supabase برقرار است.';
      $('sbStatus').style.color = '#16A34A';
    } else {
      $('sbStatus').textContent = '⚠️ پاسخ سرور: '+res.status;
      $('sbStatus').style.color = '#D97706';
    }
  }catch(e){
    $('sbStatus').textContent = '❌ خطا در اتصال: '+e.message;
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
  ['mehr_products','mehr_cart','mehr_wish','mehr_orders','mehr_coupons','mehr_user','mehr_reviews']
    .forEach(k=>localStorage.removeItem(k));
  location.reload();
}

/* ورود / ثبت‌نام */
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

/* ربات پرسش و پاسخ */
const BOT_RULES = [
  {keys:['سلام','درود','وقت بخیر','hi','hello'],
   reply:()=>'سلام 🌞 به مهرشاپ خوش آمدی. چطور می‌تونم کمکت کنم؟\nمی‌تونی بپرسی: قیمت، ارسال، تخفیف، ساعت کاری، پیگیری سفارش.'},
  {keys:['قیمت','چند','هزینه'],
   reply:()=>{
     if(!products.length) return 'هنوز محصولی ثبت نشده که قیمتش رو بگم.';
     const list = products.slice(0,5).map(p=>`• ${p.name}: ${fmt(p.price)} تومان`).join('\n');
     return 'چند نمونه از قیمت‌ها:\n'+list+'\nبرای بقیه محصولات، صفحه اصلی رو ببین.';
   }},
  {keys:['ارسال','پست','چند روز','کی میرسه','کی می‌رسه'],
   reply:()=>'🚚 ارسال به سراسر کشور.\n• تهران: ۱ روز کاری\n• شهرستان: ۲ تا ۴ روز کاری\n• سفارش بالای ۵۰۰ هزار تومان → ارسال رایگان.'},
  {keys:['تخفیف','کد','کوپن','off'],
   reply:()=>coupons.length
     ? 'کدهای فعال:\n'+coupons.map(c=>`🎟️ ${c.code} → ${c.percent}٪ تخفیف`).join('\n')
     : 'فعلاً کد تخفیف فعالی نداریم. اما برای خبرهای تخفیف، ما رو دنبال کن 💛'},
  {keys:['پیگیری','سفارش من','کجاست','وضعیت سفارش'],
   reply:()=>orders.length
     ? `📦 شما ${fmt(orders.length)} سفارش ثبت‌شده داری.\nآخرین سفارش: ${orders[orders.length-1].date}\nبرای جزئیات بیشتر به «داشبورد مدیریتی» برو.`
     : 'هنوز سفارشی ثبت نکردی. پس از ثبت، از همین‌جا می‌تونی پیگیری کنی.'},
  {keys:['ساعت','کاری','باز','چند تا چند'],
   reply:()=>'🕘 ساعات پاسخگویی: هر روز ۹ صبح تا ۹ شب.\nدر خارج از این ساعت، سفارش‌ها ثبت می‌شن و روز بعد پردازش می‌شن.'},
  {keys:['گارانتی','ضمانت','اصالت','اصل'],
   reply:()=>'✅ تمام محصولات دارای ضمانت اصالت هستن.\nدر صورت وجود مشکل، تا ۷ روز امکان مرجوعی وجود داره.'},
  {keys:['پرداخت','کارت','درگاه','آنلاین'],
   reply:()=>'💳 پرداخت آنلاین از طریق درگاه امن انجام می‌شه.\nدر نسخه فعلی این یک نمونه نمایشی است و پرداخت واقعی انجام نمی‌شه.'},
  {keys:['پیشنهاد','چی بخرم','محبوب','پرفروش','بهترین'],
   reply:()=>{
     const top = [...products].sort((a,b)=>(b.sold||0)-(a.sold||0)).slice(0,3);
     if(!top.length || !top[0].sold) return 'هنوز فروشی ثبت نشده که پیشنهاد بدم.';
     return '🔥 پرفروش‌ترین‌ها:\n'+top.map(p=>`• ${p.name} (${fmt(p.sold)} فروش)`).join('\n');
   }},
  {keys:['موجود','ناموجود','دارید'],
   reply:()=>{
     const inStock = products.filter(p=>(p.stock||0)>0).slice(0,5);
     if(!inStock.length) return 'فعلاً محصول موجودی ثبت نشده.';
     return '✅ موجود در انبار:\n'+inStock.map(p=>`• ${p.name} (${fmt(p.stock)} عدد)`).join('\n');
   }},
  {keys:['تماس','شماره','تلفن','ایمیل'],
   reply:()=>'📞 ۰۲۱-۱۲۳۴۵۶۷۸\n✉️ info@mehrshop.ir\n📍 تهران'},
  {keys:['درباره','مهرشاپ','کی هستید'],
   reply:()=>'🌞 مهرشاپ یک فروشگاه آنلاین خوراکی، مواد غذایی و لوازم بهداشتی است.\nشعار ما: «با مهر بخر، با خیال راحت».'},
  {keys:['ممنون','مرسی','thanks','سپاس'],
   reply:()=>'خواهش می‌کنم 💛 هر وقت سؤالی داشتی، در خدمتم.'},
  {keys:['خداحافظ','بای','خدانگهدار'],
   reply:()=>'خدانگهدار 🌞 منتظر خرید بعدی‌ات هستم.'}
];

function localBotReply(text){
  const t = text.toLowerCase();
  for(const r of BOT_RULES){
    if(r.keys.some(k=>t.includes(k))) return r.reply();
  }
  return 'متأسفم، متوجه نشدم 🤔\nمی‌تونی بپرسی:\n• قیمت محصولات\n• زمان ارسال\n• کد تخفیف\n• پیگیری سفارش\n• ساعات کاری';
}

async function aiBotReply(text){
  if(!aiCfg.key) return null;
  try{
    const sys = `تو دستیار فروشگاه آنلاین «مهرشاپ» هستی. شعار: با مهر بخر، با خیال راحت.
محصولات: خوراکی، مواد غذایی، بهداشتی و شخصی.
پاسخ‌ها را کوتاه، گرم و به فارسی بده.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+aiCfg.key
      },
      body: JSON.stringify({
        model: aiCfg.model || 'gpt-4o-mini',
        messages:[
          {role:'system',content:sys},
          {role:'user',content:text}
        ],
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
    pushBot('سلام 🌞 من دستیار مهرشاپم.\nچطور می‌تونم کمکت کنم؟');
    quickReplies(['قیمت‌ها','زمان ارسال','کد تخفیف','پیگیری سفارش','پیشنهاد خرید']);
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

/* راه‌اندازی */
$('search').addEventListener('input',e=>{
  searchQuery = e.target.value; renderProducts(); go('home');
});
$('cartBtn').onclick = openCart;
$('wishBtn').onclick = ()=>go('wish');
$('userBtn').onclick = openAuth;
$('checkout').onclick = checkout;

renderCategories();
renderProducts();
updateCart();
updateWishCount();
updateUserBtn();
