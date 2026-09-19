/* ============================================================
   لرمارکت — اسکریپت کامل
   ============================================================ */

const CONFIG = {
  brandName: 'لرمارکت',
  slogan: 'تازه، سریع، به‌صرفه',
  defaultAdminPass: 'mehrshop123',
  imageBucket: 'products',
  imageMaxSize: 800,
  imageQuality: 0.82
};

/* 🔐 ایمیل ادمین */
const ADMIN_EMAILS = ['heradmmk@gmail.com', 'heradmmk@gmil.com'];
function $(id){return document.getElementById(id);}
const fmt = n => Number(n||0).toLocaleString('fa-IR');
const load = (k,def)=>{try{return JSON.parse(localStorage.getItem(k)) ?? def;}catch(e){return def;}};
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const STATUS_LABELS = {
  pending:    {label:'در انتظار', icon:'⏳', cls:'status-pending'},
  processing: {label:'در حال پردازش', icon:'🔄', cls:'status-processing'},
  shipped:    {label:'ارسال شده', icon:'🚚', cls:'status-shipped'},
  delivered:  {label:'تحویل داده شده', icon:'✅', cls:'status-delivered'},
  cancelled:  {label:'لغو شده', icon:'❌', cls:'status-cancelled'}
};

/* ══════════════════════════════════════════════════
   ابزار جستجو و تم
   ══════════════════════════════════════════════════ */
function normalizeText(str){
  if(!str) return '';
  return String(str).toLowerCase()
    .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
    .replace(/[ةۀ]/g,'ه').replace(/[أإآا]/g,'ا')
    .replace(/[ؤو]/g,'و').replace(/[ئ]/g,'ی')
    .replace(/[\u064B-\u0652]/g,'')
    .replace(/[\u200C\u200F\u200E]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function matchesSearch(name, query){
  if(!query) return true;
  const n = normalizeText(name), q = normalizeText(query);
  if(!q) return true;
  return q.split(' ').filter(Boolean).every(w => n.includes(w));
}
function initTheme(){
  const saved = load('mehr_theme', null);
  const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (saved === null && prefers);
  applyTheme(isDark ? 'dark' : 'light');
  const btn = $('themeBtn');
  if(btn){
    btn.onclick = ()=>{
      const cur = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(cur ? 'light' : 'dark');
    };
  }
}
function applyTheme(theme){
  if(theme === 'dark'){
    document.documentElement.setAttribute('data-theme','dark');
    if($('themeBtn')) $('themeBtn').textContent = '☀️';
    save('mehr_theme','dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if($('themeBtn')) $('themeBtn').textContent = '🌙';
    save('mehr_theme','light');
  }
}

/* ══════════════════════════════════════════════════
   Supabase
   ══════════════════════════════════════════════════ */
let supabaseCfg = load('mehr_supabase', {url:'',key:''});
let sb = null, dbConnected = false;

function initSupabase(){
  if(supabaseCfg.url && supabaseCfg.key && window.supabase){
    try{
      sb = window.supabase.createClient(supabaseCfg.url, supabaseCfg.key);
      dbConnected = true;
      return true;
    }catch(e){console.error('Supabase init:', e);}
  }
  return false;
}

/* ══════════════════════════════════════════════════
   داده‌های سراسری
   ══════════════════════════════════════════════════ */
let products = [], orders = [], coupons = [], categories = [], reviews = [], reviewsByProduct = {};
let addresses = [];
let cart = load('mehr_cart', {});
let wishlist = [];
let user = null, userProfile = null;
let adminAuth = sessionStorage.getItem('mehr_admin')==='1';
let adminPass = load('mehr_adminpass', CONFIG.defaultAdminPass);
let aiCfg = load('mehr_ai', {key:'',model:'gpt-4o-mini'});
let shopInfo = load('mehr_shopinfo', {
  brand:'لرمارکت', owner:'', slogan:'تازه، سریع، به‌صرفه',
  phone:'۰۲۱-۱۲۳۴۵۶۷۸', email:'info@larmarket.ir', address:'تهران',
  instagram:'', telegram:'', whatsapp:'',
  topBar:'🌿 لرمارکت | تازه، سریع، به‌صرفه',
  story:'لرمارکت با یک هدف ساده شروع شد: خرید روزمره باید سریع، ساده و به‌صرفه باشه.'
});

let activeCat = 'همه';
let searchQuery = '';
let currentProduct = null;
let activeCoupon = null;
let pendingImages = [], editImages = [], editingId = null;
let isLoading = true;
let ordersFilter = 'all', reviewsFilter = 'pending';

const saveCart = ()=>save('mehr_cart', cart);

/* ══════════════════════════════════════════════════
   احراز هویت
   ══════════════════════════════════════════════════ */
async function checkSession(){
  if(!sb) return;
  try{
    const {data} = await sb.auth.getSession();
    if(data && data.session && data.session.user){
      user = data.session.user;
      await loadUserProfile();
      await loadUserWishlist();
    }
  }catch(e){ console.error('checkSession:', e); }
  updateUserBtn();
  updateAdminLink();
}

async function loadUserProfile(){
  if(!sb || !user) return;
  try{
    const {data} = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if(data) userProfile = data;
    else {
      const meta = user.user_metadata || {};
      const name = meta.name || (user.email ? user.email.split('@')[0] : 'کاربر');
      await sb.from('profiles').insert({id: user.id, email: user.email, name});
      userProfile = {id: user.id, email: user.email, name};
    }
  }catch(e){ console.error('loadUserProfile:', e); }
}

async function loadUserWishlist(){
  if(!sb || !user) return;
  try{
    const {data} = await sb.from('user_wishlist').select('product_id').eq('user_id', user.id);
    wishlist = (data||[]).map(x=>x.product_id);
    updateWishCount();
  }catch(e){}
}

async function signUp(email, password, name){
  if(!sb) throw new Error('دیتابیس متصل نیست.');
  const {data, error} = await sb.auth.signUp({email, password, options:{data:{name}}});
  if(error) throw error;
  if(data.user){
    user = data.user;
    try{ await sb.from('profiles').insert({id:user.id, email, name}); }catch(e){}
    userProfile = {id: user.id, email, name};
    updateUserBtn();
    updateAdminLink();
  }
  return data;
}

async function signIn(email, password){
  if(!sb) throw new Error('دیتابیس متصل نیست.');
  const {data, error} = await sb.auth.signInWithPassword({email, password});
  if(error) throw error;
  user = data.user;
  await loadUserProfile();
  await loadUserWishlist();
  updateUserBtn();
  updateAdminLink();
  return data;
}

async function signOut(){
  if(!sb) return;
  try{ await sb.auth.signOut(); }catch(e){}
  user = null; userProfile = null; wishlist = []; addresses = [];
  updateUserBtn();
  updateAdminLink();
  updateWishCount();
  renderProducts();
  go('home');
}

function isAdmin(){
  if(!user || !user.email) return false;
  const email = String(user.email).toLowerCase().trim();
  return ADMIN_EMAILS.map(e=>e.toLowerCase()).includes(email);
}
}

function updateUserBtn(){
  const btn = $('userBtn');
  if(!btn) return;
  if(user){
    const name = (userProfile && userProfile.name) || (user.email ? user.email.split('@')[0] : 'کاربر');
    btn.textContent = '👤 ' + name;
  } else {
    btn.textContent = 'ورود';
  }
}

function updateAdminLink(){
  const link = $('adminFooterLink');
  if(!link) return;
  link.style.display = isAdmin() ? '' : 'none';
}

/* ══════════════════════════════════════════════════
   بارگذاری داده
   ══════════════════════════════════════════════════ */
async function dbLoadAll(){
  if(!sb) return;
  try{
    const [pRes, oRes, cRes, rRes, catRes] = await Promise.all([
      sb.from('products').select('*').order('created_at', {ascending:false}),
      sb.from('orders').select('*').order('created_at', {ascending:false}),
      sb.from('coupons').select('*').order('created_at', {ascending:false}),
      sb.from('reviews').select('*').order('created_at', {ascending:false}),
      sb.from('categories').select('*').order('sort_order', {ascending:true})
    ]);
    products   = pRes.data || [];
    orders     = oRes.data || [];
    coupons    = cRes.data || [];
    categories = catRes.data || [];
    reviews    = rRes.data || [];
    reviewsByProduct = {};
    reviews.forEach(r=>{
      if(!reviewsByProduct[r.product_id]) reviewsByProduct[r.product_id] = [];
      reviewsByProduct[r.product_id].push(r);
    });
  }catch(e){ console.error('dbLoadAll:', e); }
}

async function loadAddresses(){
  if(!sb || !user) return;
  const {data} = await sb.from('addresses').select('*').eq('user_id', user.id).order('created_at', {ascending:false});
  addresses = data || [];
}

async function loadUserOrders(){
  if(!sb || !user) return [];
  const {data} = await sb.from('orders').select('*').eq('user_id', user.id).order('created_at', {ascending:false});
  return data || [];
}

/* ══════════════════════════════════════════════════
   عکس
   ══════════════════════════════════════════════════ */
function compressImage(file){
  return new Promise((resolve, reject)=>{
    if(!file.type.startsWith('image/')){reject(new Error('فایل عکس نیست.'));return;}
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const max = CONFIG.imageMaxSize;
        if(w > h){ if(w > max){ h = Math.round(h * max / w); w = max; } }
        else { if(h > max){ w = Math.round(w * max / h); h = max; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('خطا')), 'image/jpeg', CONFIG.imageQuality);
      };
      img.onerror = () => reject(new Error('خطا در خواندن'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('خطا در خواندن'));
    reader.readAsDataURL(file);
  });
}
async function uploadOneImage(file){
  if(!sb) throw new Error('اتصال نیست.');
  const compressed = await compressImage(file);
  const fileName = `product_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error: upErr } = await sb.storage.from(CONFIG.imageBucket).upload(fileName, compressed, {
    contentType:'image/jpeg', cacheControl:'31536000', upsert:false
  });
  if(upErr) throw upErr;
  return sb.storage.from(CONFIG.imageBucket).getPublicUrl(fileName).data.publicUrl;
}

async function handleImagesSelect(event){
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  const status = $('imageStatus');
  if(status) status.textContent = `⏳ آپلود ${files.length} عکس...`;
  let ok = 0, fail = 0;
  for(const file of files){
    const tempUrl = URL.createObjectURL(file);
    pendingImages.push({url: tempUrl, uploading: true, tempUrl});
    renderImagesGrid();
    try{
      const realUrl = await uploadOneImage(file);
      const idx = pendingImages.findIndex(x=>x.tempUrl === tempUrl);
      if(idx > -1) pendingImages[idx] = {url: realUrl, uploading: false};
      ok++;
    }catch(e){ pendingImages = pendingImages.filter(x=>x.tempUrl !== tempUrl); fail++; }
    renderImagesGrid();
  }
  if(status) status.textContent = fail===0 ? `✅ ${ok} عکس آپلود شد.` : `✅ ${ok} موفق، ❌ ${fail} ناموفق`;
  event.target.value = '';
}
function removePendingImage(i){ pendingImages.splice(i,1); renderImagesGrid(); }
function setMainImage(i){ if(i<=0) return; const [img]=pendingImages.splice(i,1); pendingImages.unshift(img); renderImagesGrid(); }
function renderImagesGrid(){
  const grid = $('imagesGrid'); if(!grid) return;
  if(!pendingImages.length){ grid.innerHTML = ''; return; }
  grid.innerHTML = pendingImages.map((img,i)=>`
    <div class="image-thumb-item">
      <img src="${img.url}" ${img.uploading?'style="opacity:.5;"':''}>
      <button type="button" class="remove-btn" onclick="removePendingImage(${i})">×</button>
      ${i===0?'<span class="main-tag">اصلی</span>':''}
      ${i!==0&&!img.uploading?`<button type="button" style="position:absolute;top:4px;right:4px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 6px;font-size:.65rem;cursor:pointer;" onclick="setMainImage(${i})">اصلی</button>`:''}
    </div>`).join('');
}
function resetImageUploader(){ pendingImages = []; renderImagesGrid(); if($('imageStatus')) $('imageStatus').textContent = ''; }

/* ══════════════════════════════════════════════════
   ویرایش محصول
   ══════════════════════════════════════════════════ */
function openEditProduct(id){
  const p = products.find(x=>x.id===id); if(!p) return;
  editingId = id;
  $('editId').value = id;
  $('editName').value = p.name || '';
  $('editPrice').value = p.price || 0;
  $('editStock').value = p.stock || 0;
  $('editEmoji').value = p.emoji || '';
  $('editDesc').value = p.desc || '';
  $('editCat').innerHTML = categories.map(c=>
    `<option value="${escapeHtml(c.name)}" ${c.name===p.cat?'selected':''}>${c.icon||'📦'} ${escapeHtml(c.name)}</option>`).join('');
  editImages = getProductImages(p).map(url=>({url,uploading:false}));
  renderEditImagesGrid();
  $('editImageStatus').textContent = '';
  $('editStatus').textContent = '';
  $('editModal').classList.add('open');
}
function closeEditModal(){ $('editModal').classList.remove('open'); editingId=null; editImages=[]; }
async function handleEditImagesSelect(event){
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  const status = $('editImageStatus');
  if(status) status.textContent = '⏳ آپلود...';
  let ok=0, fail=0;
  for(const file of files){
    const tempUrl = URL.createObjectURL(file);
    editImages.push({url: tempUrl, uploading: true, tempUrl});
    renderEditImagesGrid();
    try{
      const realUrl = await uploadOneImage(file);
      const idx = editImages.findIndex(x=>x.tempUrl === tempUrl);
      if(idx > -1) editImages[idx] = {url: realUrl, uploading: false};
      ok++;
    }catch(e){ editImages = editImages.filter(x=>x.tempUrl !== tempUrl); fail++; }
    renderEditImagesGrid();
  }
  if(status) status.textContent = fail===0 ? `✅ ${ok} اضافه شد.` : `✅ ${ok} موفق، ❌ ${fail} ناموفق`;
  event.target.value = '';
}
function removeEditImage(i){ editImages.splice(i,1); renderEditImagesGrid(); }
function setEditMainImage(i){ if(i<=0) return; const [img]=editImages.splice(i,1); editImages.unshift(img); renderEditImagesGrid(); }
function renderEditImagesGrid(){
  const grid = $('editImagesGrid'); if(!grid) return;
  if(!editImages.length){ grid.innerHTML = '<p style="color:var(--muted);font-size:.8rem;">هنوز عکسی نیست.</p>'; return; }
  grid.innerHTML = editImages.map((img,i)=>`
    <div class="image-thumb-item">
      <img src="${img.url}" ${img.uploading?'style="opacity:.5;"':''}>
      <button type="button" class="remove-btn" onclick="removeEditImage(${i})">×</button>
      ${i===0?'<span class="main-tag">اصلی</span>':''}
      ${i!==0&&!img.uploading?`<button type="button" style="position:absolute;top:2px;right:2px;background:var(--primary);color:#fff;border:none;border-radius:5px;padding:1px 5px;font-size:.62rem;cursor:pointer;" onclick="setEditMainImage(${i})">اصلی</button>`:''}
    </div>`).join('');
}
async function saveEditProduct(){
  if(!editingId) return;
  if(editImages.some(x=>x.uploading)){alert('صبر کن آپلود تمام بشه.');return;}
  const name = $('editName').value.trim();
  const price = Number($('editPrice').value);
  const stock = Number($('editStock').value)||0;
  if(!name || !price){alert('نام و قیمت لازمه.');return;}
  const status = $('editStatus');
  if(status) status.textContent = '⏳ ذخیره...';
  const p = products.find(x=>x.id===editingId);
  const oldImages = getProductImages(p);
  const newImageUrls = editImages.map(x=>x.url);
  const removed = oldImages.filter(url => !newImageUrls.includes(url));
  const updates = {
    name, price, stock,
    cat: $('editCat').value,
    emoji: $('editEmoji').value.trim() || '📦',
    desc: $('editDesc').value.trim(),
    image: newImageUrls[0] || null,
    images: newImageUrls
  };
  try{
    await dbUpdateProduct(editingId, updates);
    if(removed.length && sb){
      const files = removed.filter(u=>u&&u.includes('/storage/v1/object/public/'+CONFIG.imageBucket+'/')).map(u=>u.split('/').pop());
      if(files.length){ try{ await sb.storage.from(CONFIG.imageBucket).remove(files); }catch(e){} }
    }
    if(status){ status.textContent = '✅ ذخیره شد.'; status.style.color = '#16A34A'; }
    renderProducts(); renderAdmin();
    setTimeout(closeEditModal, 700);
  }catch(e){
    if(status){ status.textContent = '❌ خطا: ' + (e.message || e); status.style.color = 'var(--danger)'; }
  }
}

/* ══════════════════════════════════════════════════
   CRUD
   ══════════════════════════════════════════════════ */
async function dbInsertProduct(p){
  if(!sb){alert('دیتابیس نیست.'); return false;}
  const {data, error} = await sb.from('products').insert(p).select();
  if(error){alert('خطا: '+error.message); return false;}
  if(data && data[0]) products.unshift(data[0]);
  return true;
}
async function dbDeleteProduct(id){
  if(!sb) return;
  const p = products.find(x=>x.id===id);
  if(p){
    const urls = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
    const files = urls.filter(u=>u&&u.includes('/storage/v1/object/public/'+CONFIG.imageBucket+'/')).map(u=>u.split('/').pop());
    if(files.length){ try{ await sb.storage.from(CONFIG.imageBucket).remove(files); }catch(e){} }
  }
  await sb.from('products').delete().eq('id', id);
  products = products.filter(p=>p.id!==id);
}
async function dbUpdateProduct(id, updates){
  if(!sb) return;
  const {error} = await sb.from('products').update(updates).eq('id', id);
  if(error) throw error;
  const p = products.find(x=>x.id===id);
  if(p) Object.assign(p, updates);
}
async function dbInsertOrder(o){
  if(!sb){alert('دیتابیس نیست.'); return false;}
  const {data, error} = await sb.from('orders').insert(o).select();
  if(error){alert('خطا: '+error.message); return false;}
  if(data && data[0]) orders.unshift(data[0]);
  return true;
}
async function dbInsertCoupon(c){
  if(!sb) return false;
  const {data, error} = await sb.from('coupons').insert(c).select();
  if(error){alert('خطا: '+error.message); return false;}
  if(data && data[0]) coupons.unshift(data[0]);
  return true;
}
async function dbDeleteCoupon(id){
  if(!sb) return;
  await sb.from('coupons').delete().eq('id', id);
  coupons = coupons.filter(c=>c.id!==id);
}
async function dbInsertCategory(c){
  if(!sb) return false;
  const {data, error} = await sb.from('categories').insert(c).select();
  if(error){console.error(error); return false;}
  if(data && data[0]) categories.push(data[0]);
  return true;
}
async function dbDeleteCategory(id){
  if(!sb) return;
  await sb.from('categories').delete().eq('id', id);
  categories = categories.filter(c=>c.id!==id);
}

/* ══════════════════════════════════════════════════
   تنظیمات فروشگاه
   ══════════════════════════════════════════════════ */
function applyShopInfo(){
  const s = shopInfo;
  $('brandName').textContent = s.brand || 'فروشگاه';
  document.title = (s.brand || 'فروشگاه') + ' | ' + (s.slogan || '');
  if(s.topBar){
    const span = $('topBar').querySelector('.top-bar-text');
    if(span) span.textContent = s.topBar;
    else $('topBar').textContent = s.topBar;
  }
  $('heroTitle').textContent = (s.slogan || 'خرید آسان') + ' 🌿';
  $('abTitle').textContent = '🌿 درباره ' + (s.brand || '');
  $('abSlogan').textContent = s.slogan || '';
  if(s.story) $('abStory').textContent = s.story;
  $('ftBrand').textContent = '🌿 ' + (s.brand || 'فروشگاه');
  $('ftSlogan').textContent = (s.slogan || '') + '.';
  $('ftOwner').textContent = s.owner || '—';
  $('ftPhone').textContent = s.phone || '';
  $('ftEmail').textContent = s.email || '';
  $('ftAddress').textContent = s.address || '';
  $('ftCopyBrand').textContent = s.brand || '';
  $('ftCopySlogan').textContent = s.slogan || '';
  $('ctOwner').textContent = s.owner ? '👤 ' + s.owner : '';
  $('ctPhone').textContent = s.phone || '';
  $('ctEmail').textContent = s.email || '';
  $('ctAddress').textContent = s.address || '';
  $('ctInsta').innerHTML = s.instagram ? '📷 ' + s.instagram : '';
  $('ctTelegram').innerHTML = s.telegram ? '✈️ ' + s.telegram : '';
  $('ctWhatsapp').innerHTML = s.whatsapp ? '💬 ' + s.whatsapp : '';
  const chatHead = document.querySelector('.chat-head span');
  if(chatHead) chatHead.textContent = '🌿 دستیار ' + (s.brand || 'فروشگاه');
}
function saveShopInfo(){
  shopInfo = {
    brand: $('siBrand').value.trim() || 'فروشگاه',
    owner: $('siOwner').value.trim(),
    slogan: $('siSlogan').value.trim(),
    phone: $('siPhone').value.trim(),
    email: $('siEmail').value.trim(),
    address: $('siAddress').value.trim(),
    instagram: $('siInsta').value.trim(),
    telegram: $('siTelegram').value.trim(),
    whatsapp: $('siWhatsapp').value.trim(),
    topBar: $('siTopBar').value.trim(),
    story: $('siStory').value.trim()
  };
  save('mehr_shopinfo', shopInfo);
  applyShopInfo();
  $('siStatus').textContent = '✅ ذخیره شد.';
}

/* ══════════════════════════════════════════════════
   ناوبری
   ══════════════════════════════════════════════════ */
function go(page){
  if(page === 'adminLogin' || page === 'admin'){
    if(!isAdmin()){
      alert('⛔ دسترسی ندارید.');
      page = 'home';
    }
  }
  if(page === 'admin' && !adminAuth){ page = 'adminLogin'; }
  if((page === 'account' || page === 'addresses' || page === 'my-orders') && !user){
    openAuth(); return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = $('page-'+page);
  if(el) el.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='admin') renderAdmin();
  if(page==='wish') renderWishlist();
  if(page==='account') renderAccount();
  if(page==='addresses') renderAddresses();
  if(page==='my-orders') renderMyOrders();
}
function scrollToProducts(){ $('productsSection').scrollIntoView({behavior:'smooth'}); }

/* ══════════════════════════════════════════════════
   دسته‌بندی
   ══════════════════════════════════════════════════ */
function renderCategories(){
  let html = `<button class="${activeCat==='همه'?'active':''}" data-cat="همه">🌐 همه</button>`;
  categories.forEach(c=>{
    html += `<button class="${activeCat===c.name?'active':''}" data-cat="${escapeHtml(c.name)}">${c.icon||'📦'} ${escapeHtml(c.name)}</button>`;
  });
  $('categories').innerHTML = html;
  document.querySelectorAll('#categories button').forEach(b=>{
    b.onclick = ()=>{ activeCat = b.dataset.cat; renderCategories(); renderProducts(); go('home'); };
  });
}
function renderFooterCategories(){
  $('footerCats').innerHTML = categories.map(c=>
    `<li onclick="setCat('${escapeHtml(c.name)}')">${c.icon||'📦'} ${escapeHtml(c.name)}</li>`).join('');
}
function setCat(c){activeCat=c;renderCategories();renderProducts();go('home');}
function renderProductCatOptions(){
  const sel = $('pCat'); if(!sel) return;
  sel.innerHTML = categories.map(c=>
    `<option value="${escapeHtml(c.name)}">${c.icon||'📦'} ${escapeHtml(c.name)}</option>`).join('');
}

/* ══════════════════════════════════════════════════
   عکس‌های محصول
   ══════════════════════════════════════════════════ */
function getProductImages(p){
  if(Array.isArray(p.images) && p.images.length) return p.images;
  if(p.image) return [p.image];
  return [];
}
function productThumbHTML(p){
  const images = getProductImages(p);
  if(images.length){
    return `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'display:grid;place-items:center;width:100%;height:100%;font-size:2.6rem;\\'>${p.emoji||'📦'}</div>'">`;
  }
  return `<div style="display:grid;place-items:center;width:100%;height:100%;font-size:2.6rem;">${p.emoji||'📦'}</div>`;
}
function productGalleryHTML(p){
  const images = getProductImages(p);
  if(!images.length) return `<div class="thumb" style="display:grid;place-items:center;font-size:6rem;">${p.emoji||'📦'}</div>`;
  return `<div class="product-gallery">
    <img class="main-img" id="mainProductImg" src="${escapeHtml(images[0])}" alt="${escapeHtml(p.name)}">
    ${images.length>1?`<div class="thumbs">${images.map((img,i)=>
      `<img src="${escapeHtml(img)}" class="${i===0?'active':''}" onclick="switchMainImg('${escapeHtml(img)}', this)">`).join('')}</div>`:''}
  </div>`;
}
function switchMainImg(url, el){
  const main = document.getElementById('mainProductImg');
  if(main) main.src = url;
  document.querySelectorAll('.product-gallery .thumbs img').forEach(i=>i.classList.remove('active'));
  if(el) el.classList.add('active');
}

/* ══════════════════════════════════════════════════
   اسکلتون
   ══════════════════════════════════════════════════ */
function renderSkeleton(count = 8){
  const grid = $('products');
  $('emptyState').style.display = 'none';
  $('resultCount').textContent = '';
  grid.innerHTML = Array.from({length: count}).map(()=>`
    <div class="skeleton-card">
      <div class="skeleton sq"></div>
      <div class="skeleton line"></div>
      <div class="skeleton line short"></div>
      <div class="skeleton line" style="width:40%;"></div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════
   محصولات
   ══════════════════════════════════════════════════ */
function productAvgStars(id){
  const list = (reviewsByProduct[id] || []).filter(r=>r.approved !== false);
  if(!list.length) return 0;
  return list.reduce((s,r)=>s+(r.stars||0),0)/list.length;
}
function renderProducts(){
  if(isLoading){ renderSkeleton(); return; }
  const filtered = products.filter(p=>{
    const mCat = activeCat==='همه' || p.cat===activeCat;
    const mSearch = matchesSearch(p.name, searchQuery);
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
    $('products').innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px 0;">محصولی پیدا نشد 🤷‍♂️</p>';
    return;
  }
  $('products').innerHTML = filtered.map((p,idx)=>{
    const avg = productAvgStars(p.id);
    const stars = avg ? '⭐'.repeat(Math.round(avg)) : '';
    const wished = wishlist.includes(p.id) ? '❤️' : '🤍';
    const stockTag = p.stock<=0 ? '<span class="tag warn">ناموجود</span>'
                    : p.stock<5 ? '<span class="tag info">آخرین موجودی</span>' : '';
    return `
      <div class="card" data-id="${p.id}" style="animation-delay:${Math.min(idx*0.03,0.3)}s">
        <div class="thumb">
          ${productThumbHTML(p)}
          <button class="wish" onclick="event.stopPropagation();toggleWish(${p.id})">${wished}</button>
        </div>
        <h4>${escapeHtml(p.name)}</h4>
        <div class="cat">${escapeHtml(p.cat)} ${stockTag}</div>
        <div class="stars">${stars}</div>
        <div class="price">${fmt(p.price)} تومان</div>
        <button class="add" onclick="event.stopPropagation();addToCart(${p.id})">افزودن به سبد</button>
      </div>`;
  }).join('');
  document.querySelectorAll('.card').forEach(c=>{ c.onclick = ()=>showProduct(Number(c.dataset.id)); });
}
async function showProduct(id){
  const p = products.find(x=>x.id===id); if(!p) return;
  currentProduct = id;
  p.views = (p.views||0) + 1;
  dbUpdateProduct(id, {views: p.views});
  const avg = productAvgStars(id);
  const stars = avg ? '⭐'.repeat(Math.round(avg)) + ` (${avg.toFixed(1)})` : 'بدون امتیاز';
  const wished = wishlist.includes(id) ? '❤️ در علاقه‌مندی' : '🤍 افزودن به علاقه‌مندی';
  $('productDetail').innerHTML = `
    <div>${productGalleryHTML(p)}</div>
    <div>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="cat">دسته: ${escapeHtml(p.cat)} | موجودی: ${fmt(p.stock||0)}</div>
      <div class="stars">${stars}</div>
      <p>${escapeHtml(p.desc || 'بدون توضیحات.')}</p>
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
  const list = (reviewsByProduct[id]||[]).filter(r=>r.approved !== false);
  if(!list.length){ $('reviewsList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">هنوز نظری ثبت نشده.</p>'; return; }
  $('reviewsList').innerHTML = list.map(r=>`
    <div style="border-bottom:1px solid var(--border);padding:8px 0;font-size:.85rem;">
      <div style="font-weight:bold;">${escapeHtml(r.user_name||'کاربر')} <span class="stars">${'⭐'.repeat(r.stars||0)}</span></div>
      <div>${escapeHtml(r.text)}</div>
      <div style="font-size:.72rem;color:var(--muted);">${escapeHtml(r.date||'')}</div>
    </div>`).join('');
}
async function submitReview(){
  if(!currentProduct) return;
  const stars = Number($('revStars').value);
  const text = $('revText').value.trim();
  if(!text){alert('متن نظر لازمه.');return;}
  if(!user){alert('برای ثبت نظر وارد شو.');openAuth();return;}
  const r = {
    product_id: currentProduct,
    user_name: (userProfile && userProfile.name) || user.email,
    stars, text,
    date: new Date().toLocaleDateString('fa-IR'),
    approved: false
  };
  if(sb){
    const {error} = await sb.from('reviews').insert(r);
    if(error){alert('خطا: '+error.message); return;}
  }
  if(!reviewsByProduct[r.product_id]) reviewsByProduct[r.product_id] = [];
  reviewsByProduct[r.product_id].unshift(r);
  reviews.unshift(r);
  $('revText').value = '';
  alert('نظر ثبت شد ✅ بعد از تأیید ادمین نمایش داده می‌شه.');
}

/* ══════════════════════════════════════════════════
   علاقه‌مندی
   ══════════════════════════════════════════════════ */
async function toggleWish(id){
  const i = wishlist.indexOf(id);
  if(!user){
    if(i>-1) wishlist.splice(i,1); else wishlist.push(id);
    updateWishCount(); renderProducts();
    return;
  }
  try{
    if(i > -1){
      await sb.from('user_wishlist').delete().eq('user_id', user.id).eq('product_id', id);
      wishlist.splice(i,1);
    } else {
      await sb.from('user_wishlist').insert({id: Date.now(), user_id: user.id, product_id: id});
      wishlist.push(id);
    }
    updateWishCount();
    renderProducts();
  }catch(e){ alert('خطا: '+e.message); }
}
function updateWishCount(){ $('wishCount').textContent = fmt(wishlist.length); }
function renderWishlist(){
  const items = products.filter(p=>wishlist.includes(p.id));
  if(!items.length){ $('wishList').innerHTML = '<p style="color:var(--muted);">لیست علاقه‌مندی خالی است.</p>'; return; }
  $('wishList').innerHTML = items.map(p=>`
    <div class="card" onclick="showProduct(${p.id})">
      <div class="thumb">${productThumbHTML(p)}</div>
      <h4>${escapeHtml(p.name)}</h4>
      <div class="cat">${escapeHtml(p.cat)}</div>
      <div class="price">${fmt(p.price)} تومان</div>
      <button class="add" onclick="event.stopPropagation();addToCart(${p.id})">افزودن به سبد</button>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════
   سبد خرید
   ══════════════════════════════════════════════════ */
function addToCart(id){
  const p = products.find(x=>x.id===id); if(!p) return;
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
    const p = products.find(x=>x.id===Number(id)); if(!p) return;
    count += cart[id]; total += p.price * cart[id];
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
  saveCart(); renderCartItems();
}
function renderCartItems(){
  const ids = Object.keys(cart);
  if(!ids.length){ $('cartItems').innerHTML = '<div class="empty-cart"><div class="big">🛍️</div><p>سبد خرید خالی است.</p></div>'; return; }
  $('cartItems').innerHTML = ids.map(id=>{
    const p = products.find(x=>x.id===Number(id)); if(!p) return '';
    const images = getProductImages(p);
    const thumbHTML = images.length ? `<img src="${escapeHtml(images[0])}" class="cart-item-img">` : `<div style="font-size:1.6rem;">${p.emoji||'📦'}</div>`;
    return `
      <div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border);padding:10px 0;">
        ${thumbHTML}
        <div style="flex:1;">
          <div style="font-size:.88rem;font-weight:bold;">${escapeHtml(p.name)}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <button onclick="changeQty(${id},-1)" style="width:26px;height:26px;border:1px solid var(--border);background:var(--card);border-radius:6px;cursor:pointer;color:var(--text);">−</button>
            <span>${fmt(cart[id])}</span>
            <button onclick="changeQty(${id},1)" style="width:26px;height:26px;border:1px solid var(--border);background:var(--card);border-radius:6px;cursor:pointer;color:var(--text);">+</button>
          </div>
        </div>
        <div style="font-weight:bold;color:var(--primary-dark);">${fmt(p.price*cart[id])}</div>
      </div>`;
  }).join('');
}
function openCart(){$('cartPanel').classList.add('open');$('overlay').classList.add('show');}
function closeCart(){$('cartPanel').classList.remove('open');$('overlay').classList.remove('show');}

function isCouponValid(c, total){
  if(!c.active) return {ok:false, msg:'کد غیرفعاله.'};
  if(c.expire_date && new Date(c.expire_date) < new Date()) return {ok:false, msg:'کد منقضی شده.'};
  if(c.max_uses > 0 && (c.used_count||0) >= c.max_uses) return {ok:false, msg:'ظرفیت پر شده.'};
  if(c.min_order > 0 && total < c.min_order) return {ok:false, msg:`حداقل ${fmt(c.min_order)} تومان.`};
  return {ok:true};
}
function applyCoupon(){
  const code = $('couponInput').value.trim().toUpperCase();
  const c = coupons.find(x=>(x.code||'').toUpperCase()===code);
  if(!c){alert('کد معتبر نیست.');return;}
  let total = 0;
  Object.keys(cart).forEach(id=>{
    const p = products.find(x=>x.id===Number(id));
    if(p) total += p.price * cart[id];
  });
  const v = isCouponValid(c, total);
  if(!v.ok){alert(v.msg); return;}
  activeCoupon = c;
  updateCart();
  alert(`✅ ${c.percent}٪ اعمال شد.`);
}

/* ══════════════════════════════════════════════════
   ثبت سفارش
   ══════════════════════════════════════════════════ */
async function checkout(){
  const ids = Object.keys(cart);
  if(!ids.length){alert('سبد خالی است.');return;}
  if(!user){alert('برای ثبت سفارش وارد شو.'); openAuth(); return;}
  await loadAddresses();
  if(!addresses.length){
    alert('لطفاً اول یه آدرس ثبت کن.');
    go('addresses');
    return;
  }
  let total = 0;
  const items = [], productUpdates = [];
  ids.forEach(id=>{
    const p = products.find(x=>x.id===Number(id)); if(!p) return;
    const qty = cart[id];
    total += p.price*qty;
    items.push({id:p.id, name:p.name, price:p.price, qty});
    productUpdates.push({id:p.id, sold:(p.sold||0)+qty, stock:Math.max(0,(p.stock||0)-qty)});
  });
  let discount = 0;
  if(activeCoupon){
    const v = isCouponValid(activeCoupon, total);
    if(v.ok) discount = Math.round(total * activeCoupon.percent/100);
    else activeCoupon = null;
  }
  const finalTotal = total - discount;
  const defAddr = addresses.find(a=>a.is_default) || addresses[0];
  const addrStr = `${defAddr.province}، ${defAddr.city}، ${defAddr.address}`;
  const order = {
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    user_name: (userProfile && userProfile.name) || user.email,
    user_id: user.id,
    address: addrStr,
    phone: defAddr.phone,
    items, total: finalTotal, discount,
    status: 'pending'
  };
  const ok = await dbInsertOrder(order);
  if(!ok) return;
  if(activeCoupon && sb){
    try{
      await sb.from('coupons').update({used_count: (activeCoupon.used_count||0) + 1}).eq('id', activeCoupon.id);
      activeCoupon.used_count = (activeCoupon.used_count||0) + 1;
    }catch(e){}
  }
  for(const u of productUpdates){
    try{ await dbUpdateProduct(u.id, {sold:u.sold, stock:u.stock}); }catch(e){}
  }
  cart = {}; activeCoupon = null;
  $('couponInput').value = '';
  saveCart(); updateCart(); closeCart(); renderProducts();
  const shortCode = String(order.id).slice(-8);
  alert(`سفارش ثبت شد ✅\nکد: ${shortCode}\nمبلغ: ${fmt(finalTotal)} تومان`);
}

/* ══════════════════════════════════════════════════
   پیگیری سفارش
   ══════════════════════════════════════════════════ */
function searchOrder(){
  const code = $('trackInput').value.trim().replace(/\D/g,'');
  if(!code){ $('trackMsg').textContent = 'کد را وارد کن.'; return; }
  const order = orders.find(o => String(o.id).endsWith(code));
  if(!order){
    $('trackMsg').textContent = '❌ سفارشی پیدا نشد.';
    $('trackMsg').style.color = 'var(--danger)';
    $('trackResults').innerHTML = '';
    return;
  }
  $('trackMsg').textContent = '';
  $('trackResults').innerHTML = renderOrderCard(order, true);
}

function renderOrderCard(o, showTimeline){
  const status = STATUS_LABELS[o.status || 'pending'];
  const shortCode = String(o.id).slice(-8);
  const steps = ['pending','processing','shipped','delivered'];
  const currentIdx = steps.indexOf(o.status || 'pending');
  const isCancelled = o.status === 'cancelled';
  const timeline = (showTimeline && !isCancelled) ? `
    <div class="track-timeline">
      ${steps.map((s,i)=>{
        const st = STATUS_LABELS[s];
        const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'current' : '');
        return `<div class="track-step ${cls}"><div class="dot">${st.icon}</div><div class="label">${st.label}</div></div>`;
      }).join('')}
    </div>` : '';
  const itemsList = (o.items||[]).map(it=>`
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.85rem;border-bottom:1px dashed var(--border);">
      <span>${escapeHtml(it.name)} × ${fmt(it.qty)}</span>
      <span>${fmt(it.price * it.qty)} تومان</span>
    </div>`).join('');
  return `
    <div class="track-card">
      <div class="header">
        <div><div class="order-code">#${shortCode}</div><div class="meta">${escapeHtml(o.date||'')}</div></div>
        <span class="status-badge ${status.cls}">${status.icon} ${status.label}</span>
      </div>
      ${timeline}
      ${o.tracking_code ? `<p style="font-size:.88rem;"><b>کد رهگیری:</b> <span style="font-family:monospace;">${escapeHtml(o.tracking_code)}</span></p>` : ''}
      <div style="margin-top:12px;font-size:.88rem;">
        ${o.address ? `<div style="margin-bottom:8px;"><b>آدرس:</b> ${escapeHtml(o.address)}</div>` : ''}
        <div style="margin-bottom:8px;"><b>جمع کل:</b> ${fmt(o.total)} تومان</div>
        ${o.discount ? `<div style="margin-bottom:8px;color:var(--danger);"><b>تخفیف:</b> ${fmt(o.discount)} تومان</div>` : ''}
      </div>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;font-size:.85rem;color:var(--primary);">اقلام</summary>
        <div style="margin-top:8px;">${itemsList}</div>
      </details>
    </div>`;
}

/* ══════════════════════════════════════════════════
   پنل کاربری
   ══════════════════════════════════════════════════ */
function renderAccount(){
  if(!user){ go('home'); return; }
  const name = (userProfile && userProfile.name) || (user.email ? user.email.split('@')[0] : 'کاربر');
  $('accName').textContent = name;
  $('accEmail').textContent = user.email;
  if($('accNameInput')) $('accNameInput').value = name;
  if($('accPhoneInput')) $('accPhoneInput').value = (userProfile && userProfile.phone) || '';
}
async function updateProfile(){
  const name = $('accNameInput').value.trim();
  const phone = $('accPhoneInput').value.trim();
  if(!name) return alert('نام لازمه.');
  try{
    await sb.from('profiles').update({name, phone}).eq('id', user.id);
    userProfile.name = name;
    userProfile.phone = phone;
    renderAccount(); updateUserBtn();
    $('accStatus').textContent = '✅ ذخیره شد.';
    $('accStatus').style.color = '#16A34A';
    setTimeout(()=>{ $('accStatus').textContent = ''; }, 2500);
  }catch(e){ alert('خطا: '+e.message); }
}
async function renderMyOrders(){
  if(!user) return;
  const list = await loadUserOrders();
  if(!list.length){
    $('myOrdersList').innerHTML = '<div class="empty-box"><div class="big">📦</div><h4>هنوز سفارشی نداری</h4></div>';
    return;
  }
  $('myOrdersList').innerHTML = list.map(o=>renderOrderCard(o, true)).join('');
}
async function renderAddresses(){
  if(!user) return;
  await loadAddresses();
  if(!addresses.length){
    $('addressesList').innerHTML = '<p style="color:var(--muted);padding:12px 0;">هنوز آدرسی ثبت نکردی.</p>';
    return;
  }
  $('addressesList').innerHTML = addresses.map(a=>`
    <div class="track-card" style="margin-bottom:10px;padding:14px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <b>${escapeHtml(a.title||'آدرس')}</b>
          ${a.is_default ? '<span class="tag" style="background:#d1fae5;color:#065f46;margin-right:6px;">پیش‌فرض</span>' : ''}
          <div style="font-size:.85rem;color:var(--muted);margin-top:6px;">
            👤 ${escapeHtml(a.full_name||'')} — 📞 ${escapeHtml(a.phone||'')}<br>
            📍 ${escapeHtml(a.province||'')}، ${escapeHtml(a.city||'')}، ${escapeHtml(a.address||'')}<br>
            ${a.postal_code ? `📮 ${escapeHtml(a.postal_code)}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;">
          ${!a.is_default ? `<button class="btn btn-sm btn-outline" onclick="setDefaultAddress(${a.id})">پیش‌فرض</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteAddress(${a.id})">حذف</button>
        </div>
      </div>
    </div>`).join('');
}
function openAddressModal(){
  ['addrTitle','addrFullName','addrPhone','addrProvince','addrCity','addrAddress','addrPostal'].forEach(id=>{ if($(id)) $(id).value = ''; });
  if($('addrFullName') && userProfile) $('addrFullName').value = userProfile.name || '';
  if($('addrPhone') && userProfile) $('addrPhone').value = userProfile.phone || '';
  $('addressModal').classList.add('open');
}
function closeAddressModal(){ $('addressModal').classList.remove('open'); }
async function saveAddress(){
  const title = $('addrTitle').value.trim() || 'آدرس';
  const full_name = $('addrFullName').value.trim();
  const phone = $('addrPhone').value.trim();
  const province = $('addrProvince').value.trim();
  const city = $('addrCity').value.trim();
  const address = $('addrAddress').value.trim();
  const postal_code = $('addrPostal').value.trim();
  if(!full_name || !phone || !province || !city || !address){ alert('همه فیلدهای ضروری.'); return; }
  try{
    const isFirst = addresses.length === 0;
    await sb.from('addresses').insert({ id: Date.now(), user_id: user.id, title, full_name, phone, province, city, address, postal_code, is_default: isFirst });
    closeAddressModal();
    await renderAddresses();
  }catch(e){ alert('خطا: '+e.message); }
}
async function setDefaultAddress(id){
  try{
    await sb.from('addresses').update({is_default: false}).eq('user_id', user.id);
    await sb.from('addresses').update({is_default: true}).eq('id', id);
    await renderAddresses();
  }catch(e){ alert('خطا: '+e.message); }
}
async function deleteAddress(id){
  if(!confirm('حذف شود؟')) return;
  try{
    await sb.from('addresses').delete().eq('id', id);
    await renderAddresses();
  }catch(e){ alert('خطا: '+e.message); }
}

/* ══════════════════════════════════════════════════
   پنل مدیریت
   ══════════════════════════════════════════════════ */
function loginAdmin(){
  if(!isAdmin()){ alert('⛔ فقط مدیر.'); go('home'); return; }
  if($('adminPass').value === adminPass){
    adminAuth = true;
    sessionStorage.setItem('mehr_admin','1');
    $('adminPass').value = '';
    go('admin');
  } else alert('رمز اشتباه است.');
}
function logoutAdmin(){
  adminAuth = false;
  sessionStorage.removeItem('mehr_admin');
  go('home');
}
function changeAdminPass(){
  const np = $('newAdminPass').value.trim();
  if(np.length < 6){alert('حداقل ۶ کاراکتر.');return;}
  adminPass = np; save('mehr_adminpass', np);
  $('newAdminPass').value = '';
  alert('رمز تغییر کرد ✅');
}

function renderAdmin(){
  const totalRevenue = orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+(o.total||0),0);
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o=>o.status==='pending').length;
  const totalSold = products.reduce((s,p)=>s+(p.sold||0),0);
  const totalViews = products.reduce((s,p)=>s+(p.views||0),0);
  const pendingReviews = reviews.filter(r=>r.approved === false).length;

  const uniqueUsers = new Set(orders.filter(o=>o.user_id).map(o=>o.user_id)).size;
  $('statsGrid').innerHTML = `
    <div class="stat-card" onclick="showStatDetail('revenue')"><div class="label">💰 درآمد</div><div class="value">${fmt(totalRevenue)}</div><div class="sub">تومان — کلیک کن</div></div>
    <div class="stat-card" onclick="showStatDetail('orders')"><div class="label">🧾 سفارش</div><div class="value">${fmt(totalOrders)}</div><div class="sub">کلیک کن</div></div>
    <div class="stat-card" onclick="showStatDetail('sales')"><div class="label">📦 فروش</div><div class="value">${fmt(totalSold)}</div><div class="sub">قلم — کلیک کن</div></div>
    <div class="stat-card" onclick="showStatDetail('visits')"><div class="label">👁️ بازدید</div><div class="value">${fmt(totalViews)}</div><div class="sub">بار — کلیک کن</div></div>
    <div class="stat-card" onclick="showStatDetail('users')"><div class="label">👥 کاربران</div><div class="value">${fmt(uniqueUsers)}</div><div class="sub">خریدار — کلیک کن</div></div>`;

  const sortedBySold = [...products].sort((a,b)=>(b.sold||0)-(a.sold||0));
  const maxSold = Math.max(1, sortedBySold[0]?.sold||1);
  $('topSellers').innerHTML = sortedBySold.slice(0,5).map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)}</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  const lowSellers = [...products].sort((a,b)=>(a.sold||0)-(b.sold||0)).slice(0,5);
  $('lowSellers').innerHTML = lowSellers.map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar bad"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)}</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  const sortedByViews = [...products].sort((a,b)=>(b.views||0)-(a.views||0));
  const maxViews = Math.max(1, sortedByViews[0]?.views||1);
  $('topViewed').innerHTML = sortedByViews.slice(0,5).map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar"><span style="width:${((p.views||0)/maxViews)*100}%"></span></div>
      <div class="val">${fmt(p.views||0)}</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  if(!categories.length){
    $('categoriesList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">دسته‌ای نیست.</p>';
  } else {
    $('categoriesList').innerHTML = categories.map(c=>`
      <div class="tag" style="padding:6px 12px;font-size:.85rem;display:inline-flex;align-items:center;gap:6px;">
        ${c.icon||'📦'} ${escapeHtml(c.name)}
        <button onclick="deleteCategory(${c.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;">×</button>
      </div>`).join('');
  }

  if(!products.length){
    $('adminList').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);">محصولی نیست.</td></tr>';
  } else {
    $('adminList').innerHTML = products.map(p=>{
      const avg = productAvgStars(p.id);
      const images = getProductImages(p);
      const imgCell = images.length
        ? `<img src="${escapeHtml(images[0])}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">`
        : `<span style="font-size:1.4rem;">${p.emoji||'📦'}</span>`;
      return `
        <tr>
          <td>${imgCell}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.cat)}</td>
          <td>${fmt(p.price)}</td>
          <td>${fmt(p.stock||0)}</td>
          <td>${fmt(p.views||0)}</td>
          <td>${fmt(p.sold||0)}</td>
          <td>${avg?avg.toFixed(1):'—'}</td>
          <td>
            <button class="btn btn-sm" onclick="openEditProduct(${p.id})">ویرایش</button>
            <button class="btn btn-sm btn-outline" onclick="editStock(${p.id})">موجودی</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">حذف</button>
          </td>
        </tr>`;
    }).join('');
  }

  document.querySelectorAll('#ordersFilter button').forEach(b=>{
    b.classList.toggle('active', b.dataset.status === ordersFilter);
    b.onclick = ()=>{ ordersFilter = b.dataset.status; renderAdmin(); };
  });

  const filteredOrders = ordersFilter === 'all' ? orders : orders.filter(o => (o.status || 'pending') === ordersFilter);
  if(!filteredOrders.length){
    $('ordersList').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);">سفارشی نیست.</td></tr>';
  } else {
    $('ordersList').innerHTML = filteredOrders.map((o,i)=>{
      const shortCode = String(o.id).slice(-8);
      const opts = Object.keys(STATUS_LABELS).map(k=>
        `<option value="${k}" ${(o.status||'pending')===k?'selected':''}>${STATUS_LABELS[k].label}</option>`).join('');
      return `
        <tr>
          <td>${i+1}</td>
          <td style="font-family:monospace;">${shortCode}</td>
          <td style="font-size:.78rem;">${escapeHtml(o.date||'')}</td>
          <td>${escapeHtml(o.user_name||'')}</td>
          <td>${(o.items||[]).reduce((s,x)=>s+(x.qty||0),0)}</td>
          <td>${fmt(o.total)}</td>
          <td><select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">${opts}</select></td>
          <td><button class="btn btn-sm btn-outline" onclick="editTracking(${o.id})">${o.tracking_code ? '✏️' : '➕'}</button></td>
          <td><button class="btn btn-sm btn-outline" onclick="viewOrderDetail(${o.id})">جزئیات</button></td>
        </tr>`;
    }).join('');
  }

  document.querySelectorAll('#reviewsFilter button').forEach(b=>{
    b.classList.toggle('active', b.dataset.filter === reviewsFilter);
    b.onclick = ()=>{ reviewsFilter = b.dataset.filter; renderAdmin(); };
  });

  let filteredReviews = reviews;
  if(reviewsFilter === 'pending') filteredReviews = reviews.filter(r=>r.approved === false);
  if(reviewsFilter === 'approved') filteredReviews = reviews.filter(r=>r.approved !== false);

  if(!filteredReviews.length){
    $('reviewsAdminList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:12px;">نظری نیست.</p>';
  } else {
    $('reviewsAdminList').innerHTML = filteredReviews.map(r=>{
      const p = products.find(x=>x.id === r.product_id);
      const pName = p ? p.name : 'حذف‌شده';
      const isPending = r.approved === false;
      return `
        <div class="${isPending ? 'review-pending' : ''}" style="border-bottom:1px solid var(--border);padding:10px 0;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <div>
              <b>${escapeHtml(pName)}</b>
              <div style="font-size:.8rem;color:var(--muted);">${escapeHtml(r.user_name||'')} — ${escapeHtml(r.date||'')} <span class="stars">${'⭐'.repeat(r.stars||0)}</span></div>
            </div>
            ${isPending ? '<span class="tag" style="background:#fef3c7;color:#92400e;">در انتظار</span>' : '<span class="tag" style="background:#d1fae5;color:#065f46;">تأیید شده</span>'}
          </div>
          <p style="font-size:.87rem;margin:6px 0;">${escapeHtml(r.text)}</p>
          <div class="review-actions">
            ${isPending ? `<button class="btn btn-sm" onclick="approveReview(${r.id})">✅ تأیید</button>` : `<button class="btn btn-sm btn-outline" onclick="unapproveReview(${r.id})">لغو</button>`}
            <button class="btn btn-sm btn-danger" onclick="deleteReview(${r.id})">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  if(!coupons.length){
    $('couponsList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">کدی نیست.</p>';
  } else {
    $('couponsList').innerHTML = coupons.map(c=>{
      const expired = c.expire_date && new Date(c.expire_date) < new Date();
      const full = c.max_uses > 0 && (c.used_count||0) >= c.max_uses;
      const cls = (expired || !c.active || full) ? 'expired' : '';
      return `
        <div class="coupon-card ${cls}">
          <div>
            <div class="code">${escapeHtml(c.code)} — ${c.percent}٪</div>
            <div class="details">
              ${c.min_order>0?`<span>حداقل ${fmt(c.min_order)} ت</span>`:''}
              <span>استفاده: ${fmt(c.used_count||0)}${c.max_uses>0?' / '+fmt(c.max_uses):''}</span>
              ${c.expire_date?`<span>انقضا: ${new Date(c.expire_date).toLocaleDateString('fa-IR')}</span>`:''}
            </div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline" onclick="toggleCouponActive(${c.id})">${c.active?'غیرفعال':'فعال'}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCoupon(${c.id})">حذف</button>
          </div>
        </div>`;
    }).join('');
  }

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

  $('sbUrl').value = supabaseCfg.url || '';
  $('sbKey').value = supabaseCfg.key || '';
  $('sbStatus').textContent = dbConnected ? '✅ متصل' : '⚠️ متصل نیست';
  $('sbStatus').style.color = dbConnected ? '#16A34A' : '#D97706';
  $('aiKey').value = aiCfg.key || '';
  $('aiModel').value = aiCfg.model || 'gpt-4o-mini';
  renderProductCatOptions();
}

async function updateOrderStatus(id, status){
  if(!sb) return;
  try{
    await sb.from('orders').update({status}).eq('id', id);
    const o = orders.find(x=>x.id===id);
    if(o) o.status = status;
    renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
async function editTracking(id){
  const o = orders.find(x=>x.id===id);
  const code = prompt('کد رهگیری:', o.tracking_code || '');
  if(code === null) return;
  try{
    await sb.from('orders').update({tracking_code: code.trim() || null}).eq('id', id);
    o.tracking_code = code.trim() || null;
    renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
function viewOrderDetail(id){
  const o = orders.find(x=>x.id===id); if(!o) return;
  const items = (o.items||[]).map(it=>`• ${it.name} × ${it.qty} = ${fmt(it.price*it.qty)} ت`).join('\n');
  alert(`کد: ${String(o.id).slice(-8)}\nتاریخ: ${o.date}\nکاربر: ${o.user_name}\nوضعیت: ${STATUS_LABELS[o.status||'pending'].label}\n${o.address?'آدرس: '+o.address+'\n':''}\n${items}\n\nجمع: ${fmt(o.total)} ت`);
}
async function approveReview(id){
  if(!sb) return;
  try{
    await sb.from('reviews').update({approved: true}).eq('id', id);
    const r = reviews.find(x=>x.id===id);
    if(r){ r.approved = true;
      const pr = reviewsByProduct[r.product_id] || [];
      const p = pr.find(x=>x.id===id); if(p) p.approved = true;
    }
    renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
async function unapproveReview(id){
  if(!sb) return;
  try{
    await sb.from('reviews').update({approved: false}).eq('id', id);
    const r = reviews.find(x=>x.id===id);
    if(r){ r.approved = false;
      const pr = reviewsByProduct[r.product_id] || [];
      const p = pr.find(x=>x.id===id); if(p) p.approved = false;
    }
    renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
async function deleteReview(id){
  if(!confirm('حذف شود؟')) return;
  try{
    await sb.from('reviews').delete().eq('id', id);
    const r = reviews.find(x=>x.id===id);
    reviews = reviews.filter(x=>x.id!==id);
    if(r) reviewsByProduct[r.product_id] = (reviewsByProduct[r.product_id]||[]).filter(x=>x.id!==id);
    renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
async function addProduct(){
  const name = $('pName').value.trim();
  const price = Number($('pPrice').value);
  const stock = Number($('pStock').value)||0;
  if(!name || !price){alert('نام و قیمت لازمه.');return;}
  if(!$('pCat').value){alert('اول دسته بساز.'); return;}
  if(pendingImages.some(x=>x.uploading)){alert('صبر کن آپلود تمام بشه.');return;}
  const statusEl = $('addProductStatus');
  statusEl.textContent = '⏳ ذخیره...';
  const imageUrls = pendingImages.map(x=>x.url);
  const p = {
    id: Date.now(), name, price, stock,
    cat: $('pCat').value,
    emoji: $('pEmoji').value.trim() || '📦',
    desc: $('pDesc').value.trim(),
    image: imageUrls[0] || null,
    images: imageUrls,
    views:0, sold:0
  };
  const ok = await dbInsertProduct(p);
  if(!ok){ statusEl.textContent = '❌ خطا'; return; }
  $('pName').value = ''; $('pPrice').value = ''; $('pEmoji').value = ''; $('pDesc').value = '';
  resetImageUploader();
  statusEl.textContent = '✅ اضافه شد';
  setTimeout(()=>{ statusEl.textContent = ''; }, 3000);
  renderProducts(); renderAdmin();
}
async function deleteProduct(id){
  if(!confirm('حذف شود؟')) return;
  await dbDeleteProduct(id);
  renderProducts(); renderAdmin(); updateCart();
}
async function editStock(id){
  const p = products.find(x=>x.id===id);
  const val = prompt('موجودی جدید:', p.stock||0);
  if(val===null) return;
  try{ await dbUpdateProduct(id, {stock: Number(val)||0}); }catch(e){alert('خطا: '+e.message);}
  renderAdmin();
}
async function addCoupon(){
  const code = $('cpCode').value.trim().toUpperCase();
  const percent = Number($('cpPercent').value);
  const min_order = Number($('cpMinOrder').value)||0;
  const max_uses = Number($('cpMaxUses').value)||0;
  const exp = $('cpExpire').value;
  if(!code || !percent){alert('کد و درصد.');return;}
  const c = { id: Date.now(), code, percent, min_order, max_uses, used_count: 0,
    expire_date: exp ? new Date(exp).toISOString() : null, active: true };
  if(!await dbInsertCoupon(c)) return;
  $('cpCode').value=''; $('cpPercent').value=''; $('cpMinOrder').value='0';
  $('cpMaxUses').value='0'; $('cpExpire').value='';
  renderAdmin();
  alert('کد اضافه شد ✅');
}
async function toggleCouponActive(id){
  const c = coupons.find(x=>x.id===id); if(!c) return;
  try{
    await sb.from('coupons').update({active: !c.active}).eq('id', id);
    c.active = !c.active; renderAdmin();
  }catch(e){ alert('خطا: '+e.message); }
}
async function deleteCoupon(id){
  if(!confirm('حذف شود؟')) return;
  await dbDeleteCoupon(id); renderAdmin();
}
async function deleteCategory(id){
  const cat = categories.find(c=>c.id===id); if(!cat) return;
  const count = products.filter(p=>p.cat === cat.name).length;
  if(!confirm(count>0 ? `${count} محصول دارد. حذف شود؟` : 'حذف شود؟')) return;
  await dbDeleteCategory(id);
  renderCategories(); renderFooterCategories(); renderAdmin(); renderProductCatOptions();
}
async function addCategory(){
  const name = $('catName').value.trim();
  const icon = $('catIcon').value.trim() || '📦';
  if(!name) return alert('نام دسته.');
  if(categories.some(c=>c.name === name)) return alert('تکراری.');
  const c = { id: Date.now(), name, icon, sort_order: categories.length + 1 };
  if(!await dbInsertCategory(c)) return alert('خطا.');
  $('catName').value = ''; $('catIcon').value = '';
  renderCategories(); renderFooterCategories(); renderAdmin(); renderProductCatOptions();
  alert('اضافه شد ✅');
}
function saveSupabase(){
  supabaseCfg = {url:$('sbUrl').value.trim(), key:$('sbKey').value.trim()};
  save('mehr_supabase', supabaseCfg);
  initSupabase();
  $('sbStatus').textContent = '✅ ذخیره شد. صفحه را رفرش کن.';
}
async function testSupabase(){
  if(!supabaseCfg.url || !supabaseCfg.key){ $('sbStatus').textContent = '❌ اول ذخیره کن.'; return; }
  if(!sb) initSupabase();
  try{
    const {error} = await sb.from('products').select('id').limit(1);
    $('sbStatus').textContent = error ? '⚠️ '+error.message : '✅ متصل';
    $('sbStatus').style.color = error ? '#D97706' : '#16A34A';
  }catch(e){ $('sbStatus').textContent = '❌ '+e.message; }
}
function saveAI(){
  aiCfg = {key:$('aiKey').value.trim(), model:$('aiModel').value};
  save('mehr_ai', aiCfg);
  $('aiStatus').textContent = '✅ ذخیره شد.';
}

/* ══════════════════════════════════════════════════
   ورود / ثبت‌نام
   ══════════════════════════════════════════════════ */
function openAuth(){
  if(user){ go('account'); return; }
  $('authModal').classList.add('open');
  switchAuth('login');
}
function closeAuth(){ $('authModal').classList.remove('open'); }
function switchAuth(m){
  if(m==='register'){
    $('loginForm').style.display='none'; $('registerForm').style.display='block';
    $('authTitle').textContent='ثبت‌نام';
  } else {
    $('loginForm').style.display='block'; $('registerForm').style.display='none';
    $('authTitle').textContent='ورود به حساب';
  }
}
async function doLogin(){
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  if(!email || !pass){ alert('ایمیل و رمز.'); return; }
  const btn = $('loginBtn');
  if(btn){ btn.disabled = true; btn.textContent = '...'; }
  try{
    await signIn(email, pass);
    closeAuth();
    $('loginEmail').value = ''; $('loginPass').value = '';
    alert('خوش آمدی 🌿');
    renderProducts();
  }catch(e){
    alert('خطا: ' + (e.message === 'Invalid login credentials' ? 'ایمیل یا رمز اشتباه.' : e.message));
  }
  if(btn){ btn.disabled = false; btn.textContent = 'ورود'; }
}
async function doRegister(){
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass = $('regPass').value;
  if(!name || !email || !pass){ alert('همه فیلدها.'); return; }
  if(pass.length < 6){ alert('رمز حداقل ۶ کاراکتر.'); return; }
  const btn = $('registerBtn');
  if(btn){ btn.disabled = true; btn.textContent = '...'; }
  try{
    await signUp(email, pass, name);
    closeAuth();
    $('regName').value = ''; $('regEmail').value = ''; $('regPass').value = '';
    alert('ثبت‌نام موفق ✅');
    renderProducts();
  }catch(e){
    alert('خطا: ' + e.message);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'ثبت‌نام'; }
}
async function userLogout(){
  if(!confirm('از حساب خارج می‌شوی؟')) return;
  await signOut();
  alert('خارج شدی 🌿');
}

/* ══════════════════════════════════════════════════
   ربات
   ══════════════════════════════════════════════════ */
const BOT_RULES = [
  {keys:['سلام','درود','وقت بخیر','hi','hello'], reply:()=>'سلام 🌿 به '+(shopInfo.brand||'فروشگاه')+' خوش آمدی.'},
  {keys:['قیمت','چند','هزینه'], reply:()=>{
    if(!products.length) return 'محصولی نیست.';
    return 'چند نمونه:\n'+products.slice(0,5).map(p=>`• ${p.name}: ${fmt(p.price)} ت`).join('\n');
  }},
  {keys:['پیگیری','سفارش من'], reply:()=>'📦 فوتر → «پیگیری سفارش» → کد ۸ رقمی.'},
  {keys:['ارسال','پست','چند روز'], reply:()=>'🚚 تهران: ۱ روز، شهرستان: ۲ تا ۴ روز.'},
  {keys:['تخفیف','کد','کوپن'], reply:()=>{
    const active = coupons.filter(c=>isCouponValid(c,0).ok);
    return active.length ? 'کدها:\n'+active.map(c=>`🎟️ ${c.code} → ${c.percent}٪`).join('\n') : 'فعلاً کدی نیست 💛';
  }},
  {keys:['ساعت','کاری'], reply:()=>'🕘 هر روز ۹ تا ۲۱.'},
  {keys:['گارانتی','ضمانت'], reply:()=>'✅ ضمانت اصالت و ۷ روز مرجوعی.'},
  {keys:['دسته'], reply:()=>categories.length ? '📂 '+categories.map(c=>`${c.icon||'📦'} ${c.name}`).join('، ') : 'دسته‌ای نیست.'},
  {keys:['تماس','شماره','تلفن'], reply:()=>'📞 '+(shopInfo.phone||'')+'\n✉️ '+(shopInfo.email||'')},
  {keys:['ممنون','مرسی'], reply:()=>'خواهش 💛'},
  {keys:['خداحافظ','بای'], reply:()=>'خدانگهدار 🌿'}
];
function localBotReply(text){
  const t = text.toLowerCase();
  for(const r of BOT_RULES){ if(r.keys.some(k=>t.includes(k))) return r.reply(); }
  return 'متوجه نشدم 🤔';
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
        max_tokens: 250, temperature: 0.7
      })
    });
    const data = await res.json();
    if(data.choices && data.choices[0]) return data.choices[0].message.content;
    return null;
  }catch(e){ return null; }
}
async function botReply(text){ return (await aiBotReply(text)) || localBotReply(text); }
function toggleChat(){
  $('chatBox').classList.toggle('open');
  if($('chatBox').classList.contains('open') && !$('chatBody').innerHTML){
    pushBot('سلام 🌿 من دستیار '+(shopInfo.brand||'فروشگاه')+'م.');
    quickReplies(['دسته‌ها','قیمت‌ها','زمان ارسال','پیگیری سفارش']);
  }
}
function pushUser(t){ $('chatBody').innerHTML += `<div class="msg user">${escapeHtml(t)}</div>`; $('chatBody').scrollTop = $('chatBody').scrollHeight; }
function pushBot(t){ $('chatBody').innerHTML += `<div class="msg bot">${escapeHtml(t).replace(/\n/g,'<br>')}</div>`; $('chatBody').scrollTop = $('chatBody').scrollHeight; }
function quickReplies(list){
  $('chatBody').innerHTML += `<div class="quick-replies">${list.map(q=>`<button onclick="sendQuick('${q}')">${q}</button>`).join('')}</div>`;
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
async function sendQuick(t){ pushUser(t); pushBot('...'); const r = await botReply(t); const l = $('chatBody').lastElementChild; if(l && l.textContent==='...') l.remove(); pushBot(r); }
async function sendChat(){
  const v = $('chatInput').value.trim(); if(!v) return;
  pushUser(v); $('chatInput').value = ''; pushBot('...');
  const r = await botReply(v); const l = $('chatBody').lastElementChild;
  if(l && l.textContent==='...') l.remove(); pushBot(r);
}

/* ══════════════════════════════════════════════════
   راه‌اندازی
   ══════════════════════════════════════════════════ */
async function init(){
  initTheme();
  initSupabase();

  isLoading = true;
  renderSkeleton(8);

  if(dbConnected){
    await dbLoadAll();
    await checkSession();
  }
  isLoading = false;

  applyShopInfo();
  renderCategories();
  renderFooterCategories();
  renderProductCatOptions();
  renderProducts();
  updateCart();
  updateWishCount();
  updateUserBtn();
  updateAdminLink();

  let searchTimeout;
  $('search').addEventListener('input', e=>{
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(()=>{
      searchQuery = e.target.value;
      renderProducts();
      go('home');
    }, 200);
  });

  if($('trackInput')) $('trackInput').addEventListener('keydown', e=>{ if(e.key === 'Enter') searchOrder(); });

  $('cartBtn').onclick = openCart;
  $('wishBtn').onclick = ()=>go('wish');
  $('userBtn').onclick = openAuth;
  $('checkout').onclick = checkout;
}

init();
