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

function $(id){return document.getElementById(id);}
const fmt = n => Number(n||0).toLocaleString('fa-IR');
const load = (k,def)=>{try{return JSON.parse(localStorage.getItem(k)) ?? def;}catch(e){return def;}};
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ══════════════════════════════════════════════════
   جستجوی هوشمند — نرمال‌سازی متن فارسی
   ══════════════════════════════════════════════════ */
function normalizeText(str){
  if(!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[يى]/g, 'ی')          // ي عربی و ی الف مقصوره → ی فارسی
    .replace(/ك/g, 'ک')              // ک عربی → ک فارسی
    .replace(/[ةۀ]/g, 'ه')           // ة و ۀ → ه
    .replace(/[أإآا]/g, 'ا')         // أ إ آ → ا
    .replace(/[ؤو]/g, 'و')           // ؤ → و
    .replace(/[ئ]/g, 'ی')            // ئ → ی
    .replace(/[\u064B-\u0652]/g, '') // حذف اعراب
    .replace(/[\u200C\u200F\u200E]/g, ' ') // نیم‌فاصله و کاراکترهای جهت
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSearch(productName, query){
  if(!query) return true;
  const name = normalizeText(productName);
  const q = normalizeText(query);
  if(!q) return true;
  // همه کلمات جستجو باید در نام باشند (ترتیب مهم نیست)
  const words = q.split(' ').filter(Boolean);
  return words.every(w => name.includes(w));
}

/* ══════════════════════════════════════════════════
   حالت تاریک
   ══════════════════════════════════════════════════ */
function initTheme(){
  const saved = load('mehr_theme', null);
  const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (saved === null && prefers);
  applyTheme(isDark ? 'dark' : 'light');

  const btn = $('themeBtn');
  if(btn){
    btn.onclick = ()=>{
      const current = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(current ? 'light' : 'dark');
    };
  }
}

function applyTheme(theme){
  if(theme === 'dark'){
    document.documentElement.setAttribute('data-theme','dark');
    const btn = $('themeBtn');
    if(btn) btn.textContent = '☀️';
    save('mehr_theme','dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    const btn = $('themeBtn');
    if(btn) btn.textContent = '🌙';
    save('mehr_theme','light');
  }
}

/* ══════════════════════════════════════════════════
   اتصال به Supabase
   ══════════════════════════════════════════════════ */
let supabaseCfg = load('mehr_supabase', {url:'',key:''});
let sb = null;
let dbConnected = false;

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
let products = [];
let orders   = [];
let coupons  = [];
let categories = [];
let reviews  = {};

let cart     = load('mehr_cart', {});
let wishlist = load('mehr_wish', []);
let user     = load('mehr_user', null);
let adminAuth = sessionStorage.getItem('mehr_admin')==='1';
let adminPass = load('mehr_adminpass', CONFIG.defaultAdminPass);
let aiCfg     = load('mehr_ai', {key:'',model:'gpt-4o-mini'});

let shopInfo = load('mehr_shopinfo', {
  brand: 'لرمارکت',
  owner: '',
  slogan: 'تازه، سریع، به‌صرفه',
  phone: '۰۲۱-۱۲۳۴۵۶۷۸',
  email: 'info@larmarket.ir',
  address: 'تهران',
  instagram: '',
  telegram: '',
  whatsapp: '',
  topBar: '🌿 لرمارکت | تازه، سریع، به‌صرفه — ارسال رایگان بالای ۵۰۰ هزار تومان',
  story: 'لرمارکت با یک هدف ساده شروع شد: خرید روزمره باید سریع، ساده و به‌صرفه باشه. ما محصولات تازه و باکیفیت رو با قیمت منصفانه به دستت می‌رسونیم.'
});

let activeCat = 'همه';
let searchQuery = '';
let currentProduct = null;
let activeCoupon = null;
let pendingImages = [];
let editImages = [];
let editingId = null;
let isLoading = true;

const saveCart = ()=>save('mehr_cart', cart);
const saveWish = ()=>save('mehr_wish', wishlist);

/* ══════════════════════════════════════════════════
   بارگذاری از Supabase
   ══════════════════════════════════════════════════ */
async function dbLoadAll(){
  if(!sb) return;
  try{
    const [pRes, oRes, cRes, rRes, catRes] = await Promise.all([
      sb.from('products').select('*').order('created_at', {ascending:false}),
      sb.from('orders').select('*').order('created_at', {ascending:false}),
      sb.from('coupons').select('*'),
      sb.from('reviews').select('*').order('created_at', {ascending:false}),
      sb.from('categories').select('*').order('sort_order', {ascending:true})
    ]);

    products   = pRes.data || [];
    orders     = oRes.data || [];
    coupons    = cRes.data || [];
    categories = catRes.data || [];

    reviews = {};
    (rRes.data||[]).forEach(r=>{
      if(!reviews[r.product_id]) reviews[r.product_id] = [];
      reviews[r.product_id].push(r);
    });
  }catch(e){ console.error('dbLoadAll:', e); }
}

/* ══════════════════════════════════════════════════
   فشرده‌سازی و آپلود عکس
   ══════════════════════════════════════════════════ */
function compressImage(file){
  return new Promise((resolve, reject)=>{
    if(!file.type.startsWith('image/')){reject(new Error('فایل انتخابی عکس نیست.'));return;}
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
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('خطا در فشرده‌سازی')),
          'image/jpeg', CONFIG.imageQuality
        );
      };
      img.onerror = () => reject(new Error('خطا در خواندن عکس'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('خطا در خواندن فایل'));
    reader.readAsDataURL(file);
  });
}

async function uploadOneImage(file){
  if(!sb) throw new Error('اتصال به سوپابیس نیست.');
  const compressed = await compressImage(file);
  const fileName = `product_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error: upErr } = await sb.storage.from(CONFIG.imageBucket).upload(fileName, compressed, {
    contentType:'image/jpeg', cacheControl:'31536000', upsert:false
  });
  if(upErr) throw upErr;
  const { data: urlData } = sb.storage.from(CONFIG.imageBucket).getPublicUrl(fileName);
  return urlData.publicUrl;
}

/* ══════════════════════════════════════════════════
   فرم افزودن — آپلود عکس
   ══════════════════════════════════════════════════ */
async function handleImagesSelect(event){
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  const status = $('imageStatus');
  status.textContent = `⏳ در حال آپلود ${files.length} عکس...`;
  status.style.color = 'var(--primary)';

  let successCount = 0, failCount = 0;
  for(const file of files){
    const tempUrl = URL.createObjectURL(file);
    pendingImages.push({url: tempUrl, uploading: true, tempUrl});
    renderImagesGrid();
    try{
      const realUrl = await uploadOneImage(file);
      const idx = pendingImages.findIndex(x=>x.tempUrl === tempUrl);
      if(idx > -1) pendingImages[idx] = {url: realUrl, uploading: false};
      successCount++;
    }catch(e){
      console.error('upload:', e);
      pendingImages = pendingImages.filter(x=>x.tempUrl !== tempUrl);
      failCount++;
    }
    renderImagesGrid();
  }
  status.textContent = failCount===0
    ? `✅ ${successCount} عکس آپلود شد.`
    : `✅ ${successCount} موفق، ❌ ${failCount} ناموفق`;
  status.style.color = failCount===0 ? '#16A34A' : '#D97706';
  event.target.value = '';
}

function removePendingImage(index){ pendingImages.splice(index, 1); renderImagesGrid(); }
function setMainImage(index){
  if(index <= 0) return;
  const [img] = pendingImages.splice(index, 1);
  pendingImages.unshift(img);
  renderImagesGrid();
}

function renderImagesGrid(){
  const grid = $('imagesGrid');
  if(!grid) return;
  if(!pendingImages.length){ grid.innerHTML = ''; return; }
  grid.innerHTML = pendingImages.map((img, i)=>`
    <div class="image-thumb-item">
      <img src="${img.url}" alt="عکس ${i+1}" ${img.uploading ? 'style="opacity:.5;"' : ''}>
      ${img.uploading ? '<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--primary);font-size:.75rem;background:rgba(255,255,255,.5);">⏳</div>' : ''}
      <button type="button" class="remove-btn" onclick="removePendingImage(${i})" title="حذف">×</button>
      ${i === 0 ? '<span class="main-tag">عکس اصلی</span>' : ''}
      ${i !== 0 && !img.uploading ? `<button type="button" style="position:absolute;top:4px;right:4px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 6px;font-size:.65rem;cursor:pointer;" onclick="setMainImage(${i})">اصلی</button>` : ''}
    </div>
  `).join('');
}

function resetImageUploader(){
  pendingImages = [];
  renderImagesGrid();
  const status = $('imageStatus');
  if(status) status.textContent = '';
}

/* ══════════════════════════════════════════════════
   ویرایش محصول
   ══════════════════════════════════════════════════ */
function openEditProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  editingId = id;
  $('editId').value = id;
  $('editName').value = p.name || '';
  $('editPrice').value = p.price || 0;
  $('editStock').value = p.stock || 0;
  $('editEmoji').value = p.emoji || '';
  $('editDesc').value = p.desc || '';

  const sel = $('editCat');
  sel.innerHTML = categories.map(c=>
    `<option value="${escapeHtml(c.name)}" ${c.name===p.cat?'selected':''}>${c.icon||'📦'} ${escapeHtml(c.name)}</option>`
  ).join('');

  editImages = getProductImages(p).map(url => ({url, uploading:false}));
  renderEditImagesGrid();
  $('editImageStatus').textContent = '';
  $('editStatus').textContent = '';
  $('editModal').classList.add('open');
}

function closeEditModal(){
  $('editModal').classList.remove('open');
  editingId = null;
  editImages = [];
}

async function handleEditImagesSelect(event){
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  const status = $('editImageStatus');
  status.textContent = `⏳ در حال آپلود ${files.length} عکس...`;
  status.style.color = 'var(--primary)';
  let ok = 0, fail = 0;
  for(const file of files){
    const tempUrl = URL.createObjectURL(file);
    editImages.push({url: tempUrl, uploading: true, tempUrl});
    renderEditImagesGrid();
    try{
      const realUrl = await uploadOneImage(file);
      const idx = editImages.findIndex(x=>x.tempUrl === tempUrl);
      if(idx > -1) editImages[idx] = {url: realUrl, uploading: false};
      ok++;
    }catch(e){
      editImages = editImages.filter(x=>x.tempUrl !== tempUrl);
      fail++;
    }
    renderEditImagesGrid();
  }
  status.textContent = fail===0 ? `✅ ${ok} عکس اضافه شد.` : `✅ ${ok} موفق، ❌ ${fail} ناموفق`;
  status.style.color = fail===0 ? '#16A34A' : '#D97706';
  event.target.value = '';
}

function removeEditImage(index){ editImages.splice(index, 1); renderEditImagesGrid(); }
function setEditMainImage(index){
  if(index <= 0) return;
  const [img] = editImages.splice(index, 1);
  editImages.unshift(img);
  renderEditImagesGrid();
}

function renderEditImagesGrid(){
  const grid = $('editImagesGrid');
  if(!grid) return;
  if(!editImages.length){
    grid.innerHTML = '<p style="color:var(--muted);font-size:.8rem;">هنوز عکسی نیست.</p>';
    return;
  }
  grid.innerHTML = editImages.map((img, i)=>`
    <div class="image-thumb-item">
      <img src="${img.url}" ${img.uploading ? 'style="opacity:.5;"' : ''} alt="">
      ${img.uploading ? '<div style="position:absolute;inset:0;display:grid;place-items:center;background:rgba(255,255,255,.5);">⏳</div>' : ''}
      <button type="button" class="remove-btn" onclick="removeEditImage(${i})" title="حذف">×</button>
      ${i === 0 ? '<span class="main-tag">اصلی</span>' : ''}
      ${i !== 0 && !img.uploading ? `<button type="button" style="position:absolute;top:2px;right:2px;background:var(--primary);color:#fff;border:none;border-radius:5px;padding:1px 5px;font-size:.62rem;cursor:pointer;" onclick="setEditMainImage(${i})">اصلی</button>` : ''}
    </div>
  `).join('');
}

async function saveEditProduct(){
  if(!editingId) return;
  if(editImages.some(x=>x.uploading)){alert('صبر کن تا آپلود عکس‌ها تمام بشه.');return;}
  const name = $('editName').value.trim();
  const price = Number($('editPrice').value);
  const stock = Number($('editStock').value)||0;
  if(!name || !price){alert('نام و قیمت را وارد کن.');return;}

  const status = $('editStatus');
  status.textContent = '⏳ در حال ذخیره...';
  status.style.color = 'var(--primary)';

  const p = products.find(x=>x.id===editingId);
  const oldImages = getProductImages(p);
  const newImageUrls = editImages.map(x=>x.url);
  const removedImages = oldImages.filter(url => !newImageUrls.includes(url));

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
    if(removedImages.length && sb){
      const files = removedImages
        .filter(u=>u && u.includes('/storage/v1/object/public/'+CONFIG.imageBucket+'/'))
        .map(u=>u.split('/').pop());
      if(files.length){ try{ await sb.storage.from(CONFIG.imageBucket).remove(files); }catch(e){} }
    }
    status.textContent = '✅ تغییرات ذخیره شد.';
    status.style.color = '#16A34A';
    renderProducts(); renderAdmin();
    setTimeout(closeEditModal, 700);
  }catch(e){
    status.textContent = '❌ خطا: ' + (e.message || e);
    status.style.color = 'var(--danger)';
  }
}

/* ══════════════════════════════════════════════════
   CRUD
   ══════════════════════════════════════════════════ */
async function dbInsertProduct(p){
  if(!sb){alert('اتصال به دیتابیس برقرار نیست.'); return false;}
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
    const files = urls.filter(u=>u && u.includes('/storage/v1/object/public/'+CONFIG.imageBucket+'/')).map(u=>u.split('/').pop());
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
async function dbInsertCategory(c){
  if(!sb) return false;
  const {data, error} = await sb.from('categories').insert(c).select();
  if(error){console.error('category insert:', error); return false;}
  if(data && data[0]) categories.push(data[0]);
  return true;
}
async function dbDeleteCategory(id){
  if(!sb) return;
  await sb.from('categories').delete().eq('id', id);
  categories = categories.filter(c=>c.id!==id);
}

async function addCategory(){
  const name = $('catName').value.trim();
  const icon = $('catIcon').value.trim() || '📦';
  if(!name){alert('نام دسته را وارد کن.'); return;}
  if(categories.some(c=>c.name === name)){alert('این دسته قبلاً وجود دارد.'); return;}
  const c = { id: Date.now(), name, icon, sort_order: categories.length + 1 };
  const ok = await dbInsertCategory(c);
  if(!ok){alert('خطا در افزودن دسته.'); return;}
  $('catName').value = ''; $('catIcon').value = '';
  renderCategories(); renderFooterCategories(); renderAdmin(); renderProductCatOptions();
  alert('دسته اضافه شد ✅');
}

async function deleteCategory(id){
  const cat = categories.find(c=>c.id===id);
  if(!cat) return;
  const count = products.filter(p=>p.cat === cat.name).length;
  const msg = count > 0 ? `این دسته ${count} محصول دارد. حذف شود؟` : 'این دسته حذف شود؟';
  if(!confirm(msg)) return;
  await dbDeleteCategory(id);
  renderCategories(); renderFooterCategories(); renderAdmin(); renderProductCatOptions();
}

/* ══════════════════════════════════════════════════
   تنظیمات فروشگاه
   ══════════════════════════════════════════════════ */
function applyShopInfo(){
  const s = shopInfo;
  $('brandName').textContent = s.brand || 'فروشگاه';
  document.title = (s.brand || 'فروشگاه') + ' | ' + (s.slogan || '');
  if(s.topBar) $('topBar').textContent = s.topBar;
  $('heroTitle').textContent = (s.slogan || 'خرید آسان') + ' 🌿';
  $('heroSub').textContent = 'محصولات متنوع — با گرمای مهر در خانه‌ات.';
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
  let html = `<button class="${activeCat==='همه'?'active':''}" data-cat="همه">🌐 همه</button>`;
  categories.forEach(c=>{
    html += `<button class="${activeCat===c.name?'active':''}" data-cat="${escapeHtml(c.name)}">${c.icon||'📦'} ${escapeHtml(c.name)}</button>`;
  });
  $('categories').innerHTML = html;
  document.querySelectorAll('#categories button').forEach(b=>{
    b.onclick = ()=>{
      activeCat = b.dataset.cat;
      renderCategories(); renderProducts(); go('home');
    };
  });
}
function renderFooterCategories(){
  $('footerCats').innerHTML = categories.map(c=>
    `<li onclick="setCat('${escapeHtml(c.name)}')">${c.icon||'📦'} ${escapeHtml(c.name)}</li>`
  ).join('');
}
function setCat(c){activeCat=c;renderCategories();renderProducts();go('home');}
function renderProductCatOptions(){
  const sel = $('pCat');
  if(!sel) return;
  sel.innerHTML = categories.map(c=>
    `<option value="${escapeHtml(c.name)}">${c.icon||'📦'} ${escapeHtml(c.name)}</option>`
  ).join('');
}

/* ══════════════════════════════════════════════════
   نمایش عکس‌ها
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
  if(!images.length){
    return `<div class="thumb" style="display:grid;place-items:center;font-size:6rem;">${p.emoji||'📦'}</div>`;
  }
  return `
    <div class="product-gallery">
      <img class="main-img" id="mainProductImg" src="${escapeHtml(images[0])}" alt="${escapeHtml(p.name)}">
      ${images.length > 1 ? `
        <div class="thumbs">
          ${images.map((img, i)=>`
            <img src="${escapeHtml(img)}" class="${i===0?'active':''}" onclick="switchMainImg('${escapeHtml(img)}', this)" alt="عکس ${i+1}">
          `).join('')}
        </div>
      ` : ''}
    </div>`;
}
function switchMainImg(url, el){
  const main = document.getElementById('mainProductImg');
  if(main) main.src = url;
  document.querySelectorAll('.product-gallery .thumbs img').forEach(i=>i.classList.remove('active'));
  if(el) el.classList.add('active');
}

/* ══════════════════════════════════════════════════
   اسکلتون لودینگ
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
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════════
   محصولات
   ══════════════════════════════════════════════════ */
function productAvgStars(id){
  const list = reviews[id] || [];
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

  $('products').innerHTML = filtered.map((p, idx)=>{
    const avg = productAvgStars(p.id);
    const stars = avg ? '⭐'.repeat(Math.round(avg)) : '';
    const wished = wishlist.includes(p.id) ? '❤️' : '🤍';
    const stockTag = p.stock<=0 ? '<span class="tag warn">ناموجود</span>'
                    : p.stock<5 ? '<span class="tag info">آخرین موجودی</span>' : '';
    return `
      <div class="card" data-id="${p.id}" style="animation-delay:${Math.min(idx*0.03, 0.3)}s">
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

  document.querySelectorAll('.card').forEach(c=>{
    c.onclick = ()=>showProduct(Number(c.dataset.id));
  });
}

async function showProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
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
  const list = reviews[id]||[];
  if(!list.length){
    $('reviewsList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">هنوز نظری ثبت نشده.</p>';
    return;
  }
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
  if(!text){alert('متن نظر را بنویس.');return;}
  const r = {
    product_id: currentProduct,
    user_name: user ? user.name : 'مهمان',
    stars, text,
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
    $('wishList').innerHTML = '<p style="color:var(--muted);">لیست علاقه‌مندی خالی است.</p>';
    return;
  }
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
    const images = getProductImages(p);
    const thumbHTML = images.length
      ? `<img src="${escapeHtml(images[0])}" class="cart-item-img" alt="">`
      : `<div style="font-size:1.6rem;">${p.emoji||'📦'}</div>`;
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
    productUpdates.push({id: p.id, sold: (p.sold||0) + qty, stock: Math.max(0, (p.stock||0) - qty)});
  });
  let discount = 0;
  if(activeCoupon) discount = Math.round(total * activeCoupon.percent/100);
  const finalTotal = total - discount;
  const order = {
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    user_name: user ? user.name : 'مهمان',
    items, total: finalTotal, discount
  };
  const ok = await dbInsertOrder(order);
  if(!ok) return;
  for(const u of productUpdates){
    try{ await dbUpdateProduct(u.id, {sold:u.sold, stock:u.stock}); }catch(e){}
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
  } else { alert('رمز اشتباه است.'); }
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
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)} فروش</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  const lowSellers = [...products].sort((a,b)=>(a.sold||0)-(b.sold||0)).slice(0,5);
  $('lowSellers').innerHTML = lowSellers.map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar bad"><span style="width:${((p.sold||0)/maxSold)*100}%"></span></div>
      <div class="val">${fmt(p.sold||0)} فروش</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  const sortedByViews = [...products].sort((a,b)=>(b.views||0)-(a.views||0));
  const maxViews = Math.max(1, sortedByViews[0]?.views||1);
  $('topViewed').innerHTML = sortedByViews.slice(0,5).map(p=>`
    <div class="bar-row">
      <div class="name">${p.emoji||'📦'} ${escapeHtml(p.name)}</div>
      <div class="bar"><span style="width:${((p.views||0)/maxViews)*100}%"></span></div>
      <div class="val">${fmt(p.views||0)} بازدید</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  const wishCounts = products.map(p=>({p, count: wishlist.includes(p.id)?1:0}))
    .filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
  $('topWished').innerHTML = wishCounts.length ? wishCounts.map(x=>`
    <div class="bar-row">
      <div class="name">${x.p.emoji||'📦'} ${escapeHtml(x.p.name)}</div>
      <div class="bar"><span style="width:100%"></span></div>
      <div class="val">${fmt(x.count)} علاقه‌مندی</div>
    </div>`).join('') : '<p style="color:var(--muted);font-size:.85rem;">داده‌ای نیست.</p>';

  if(!categories.length){
    $('categoriesList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">هنوز دسته‌ای نیست.</p>';
  } else {
    $('categoriesList').innerHTML = categories.map(c=>`
      <div class="tag" style="padding:6px 12px;font-size:.85rem;display:inline-flex;align-items:center;gap:6px;">
        ${c.icon||'📦'} ${escapeHtml(c.name)}
        <button onclick="deleteCategory(${c.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;line-height:1;">×</button>
      </div>`).join('');
  }

  if(!products.length){
    $('adminList').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);">هنوز محصولی نیست.</td></tr>';
  } else {
    $('adminList').innerHTML = products.map(p=>{
      const avg = productAvgStars(p.id);
      const images = getProductImages(p);
      const imgCell = images.length
        ? `<img src="${escapeHtml(images[0])}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" alt="">
           ${images.length > 1 ? `<span style="font-size:.7rem;color:var(--muted);">+${images.length-1}</span>` : ''}`
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

  if(!orders.length){
    $('ordersList').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">سفارشی ثبت نشده.</td></tr>';
  } else {
    $('ordersList').innerHTML = orders.map((o,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${escapeHtml(o.date||'')}</td>
        <td>${escapeHtml(o.user_name||'')}</td>
        <td>${(o.items||[]).reduce((s,x)=>s+(x.qty||0),0)}</td>
        <td>${fmt(o.total)} تومان</td>
      </tr>`).join('');
  }

  if(!coupons.length){
    $('couponsList').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">کدی ثبت نشده.</p>';
  } else {
    $('couponsList').innerHTML = coupons.map(c=>`
      <div class="tag" style="margin:4px;font-size:.85rem;padding:5px 12px;">
        ${escapeHtml(c.code)} — ${c.percent}٪
        <button onclick="deleteCoupon(${c.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;">×</button>
      </div>`).join('');
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
  $('sbStatus').textContent = dbConnected ? '✅ متصل به سوپابیس' : '⚠️ به سوپابیس متصل نیست';
  $('sbStatus').style.color = dbConnected ? '#16A34A' : '#D97706';

  $('aiKey').value = aiCfg.key || '';
  $('aiModel').value = aiCfg.model || 'gpt-4o-mini';

  renderProductCatOptions();
}

async function addProduct(){
  const name = $('pName').value.trim();
  const price = Number($('pPrice').value);
  const stock = Number($('pStock').value)||0;
  if(!name || !price){alert('نام و قیمت را وارد کن.');return;}
  if(!$('pCat').value){alert('اول یک دسته بساز.'); return;}
  if(pendingImages.some(x=>x.uploading)){alert('صبر کن تا آپلود عکس‌ها تمام بشه.');return;}

  const statusEl = $('addProductStatus');
  statusEl.textContent = '⏳ در حال ذخیره...';
  statusEl.style.color = 'var(--primary)';

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
  if(!ok){
    statusEl.textContent = '❌ خطا در ذخیره';
    statusEl.style.color = 'var(--danger)';
    return;
  }
  $('pName').value = ''; $('pPrice').value = ''; $('pEmoji').value = ''; $('pDesc').value = '';
  resetImageUploader();
  statusEl.textContent = '✅ محصول اضافه شد';
  statusEl.style.color = '#16A34A';
  setTimeout(()=>{ statusEl.textContent = ''; }, 3000);
  renderProducts(); renderAdmin();
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
  try{ await dbUpdateProduct(id, {stock: Number(val)||0}); }catch(e){alert('خطا: '+e.message);}
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
async function deleteCoupon(id){ await dbDeleteCoupon(id); renderAdmin(); }

function saveSupabase(){
  supabaseCfg = {url:$('sbUrl').value.trim(), key:$('sbKey').value.trim()};
  save('mehr_supabase', supabaseCfg);
  initSupabase();
  $('sbStatus').textContent = '✅ ذخیره شد. صفحه را رفرش کن.';
  $('sbStatus').style.color = '#16A34A';
}
async function testSupabase(){
  if(!supabaseCfg.url || !supabaseCfg.key){
    $('sbStatus').textContent = '❌ اول تنظیمات را ذخیره کن.';
    $('sbStatus').style.color = 'var(--danger)'; return;
  }
  if(!sb) initSupabase();
  if(!sb){
    $('sbStatus').textContent = '❌ کتابخانه سوپابیس لود نشده.';
    $('sbStatus').style.color = 'var(--danger)'; return;
  }
  try{
    const {error} = await sb.from('products').select('id').limit(1);
    if(error){
      $('sbStatus').textContent = '⚠️ خطا: ' + error.message;
      $('sbStatus').style.color = '#D97706';
    } else {
      const {error: stErr} = await sb.storage.from(CONFIG.imageBucket).list('', {limit:1});
      if(stErr){
        $('sbStatus').textContent = '✅ دیتابیس متصل. ⚠️ Storage: '+stErr.message;
        $('sbStatus').style.color = '#D97706';
      } else {
        $('sbStatus').textContent = '✅ دیتابیس و Storage متصل.';
        $('sbStatus').style.color = '#16A34A';
      }
    }
  }catch(e){
    $('sbStatus').textContent = '❌ خطا: ' + e.message;
    $('sbStatus').style.color = 'var(--danger)';
  }
}
function saveAI(){
  aiCfg = {key:$('aiKey').value.trim(), model:$('aiModel').value};
  save('mehr_ai', aiCfg);
  $('aiStatus').textContent = '✅ ذخیره شد.';
  $('aiStatus').style.color = '#16A34A';
}
function resetAll(){
  if(!confirm('داده‌های محلی مرورگر پاک شوند؟')) return;
  ['mehr_cart','mehr_wish','mehr_user'].forEach(k=>localStorage.removeItem(k));
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
  alert('خوش آمدی '+user.name+' 🌿');
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
  {keys:['سلام','درود','وقت بخیر','hi','hello'], reply:()=>'سلام 🌿 به '+(shopInfo.brand||'فروشگاه')+' خوش آمدی.'},
  {keys:['قیمت','چند','هزینه'], reply:()=>{
    if(!products.length) return 'هنوز محصولی ثبت نشده.';
    const list = products.slice(0,5).map(p=>`• ${p.name}: ${fmt(p.price)} تومان`).join('\n');
    return 'چند نمونه:\n'+list;
  }},
  {keys:['ارسال','پست','چند روز'], reply:()=>'🚚 تهران: ۱ روز کاری، شهرستان: ۲ تا ۴ روز کاری.'},
  {keys:['تخفیف','کد','کوپن'], reply:()=>coupons.length
    ? 'کدهای فعال:\n'+coupons.map(c=>`🎟️ ${c.code} → ${c.percent}٪`).join('\n')
    : 'فعلاً کد تخفیف فعالی نداریم 💛'},
  {keys:['پیگیری','سفارش من'], reply:()=>orders.length ? `📦 شما ${fmt(orders.length)} سفارش داری.` : 'هنوز سفارشی ثبت نکردی.'},
  {keys:['ساعت','کاری'], reply:()=>'🕘 هر روز ۹ صبح تا ۹ شب.'},
  {keys:['گارانتی','ضمانت'], reply:()=>'✅ ضمانت اصالت و ۷ روز مرجوعی.'},
  {keys:['پیشنهاد','پرفروش'], reply:()=>{
    const top = [...products].sort((a,b)=>(b.sold||0)-(a.sold||0)).slice(0,3);
    if(!top.length || !top[0].sold) return 'هنوز فروشی ثبت نشده.';
    return '🔥 پرفروش‌ها:\n'+top.map(p=>`• ${p.name}`).join('\n');
  }},
  {keys:['موجود'], reply:()=>{
    const inStock = products.filter(p=>(p.stock||0)>0).slice(0,5);
    if(!inStock.length) return 'فعلاً موجودی ثبت نشده.';
    return '✅ موجود:\n'+inStock.map(p=>`• ${p.name} (${fmt(p.stock)})`).join('\n');
  }},
  {keys:['دسته'], reply:()=>{
    if(!categories.length) return 'هنوز دسته‌ای نیست.';
    return '📂 دسته‌های ما:\n'+categories.map(c=>`${c.icon||'📦'} ${c.name}`).join('\n');
  }},
  {keys:['تماس','شماره','تلفن'], reply:()=>'📞 '+(shopInfo.phone||'')+'\n✉️ '+(shopInfo.email||'')},
  {keys:['درباره'], reply:()=>(shopInfo.brand||'فروشگاه')+' — شعار: '+(shopInfo.slogan||'')},
  {keys:['ممنون','مرسی'], reply:()=>'خواهش می‌کنم 💛'},
  {keys:['خداحافظ','بای'], reply:()=>'خدانگهدار 🌿'}
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
        max_tokens: 250, temperature: 0.7
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
    pushBot('سلام 🌿 من دستیار '+(shopInfo.brand||'فروشگاه')+'م.');
    quickReplies(['دسته‌ها','قیمت‌ها','زمان ارسال','کد تخفیف']);
  }
}
function pushUser(text){ $('chatBody').innerHTML += `<div class="msg user">${escapeHtml(text)}</div>`; $('chatBody').scrollTop = $('chatBody').scrollHeight; }
function pushBot(text){ $('chatBody').innerHTML += `<div class="msg bot">${escapeHtml(text).replace(/\n/g,'<br>')}</div>`; $('chatBody').scrollTop = $('chatBody').scrollHeight; }
function quickReplies(list){
  $('chatBody').innerHTML += `<div class="quick-replies">${list.map(q=>`<button onclick="sendQuick('${q}')">${q}</button>`).join('')}</div>`;
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
async function sendQuick(t){ pushUser(t); pushBot('...'); const reply = await botReply(t); const last = $('chatBody').lastElementChild; if(last && last.textContent==='...') last.remove(); pushBot(reply); }
async function sendChat(){
  const v = $('chatInput').value.trim();
  if(!v) return;
  pushUser(v); $('chatInput').value = ''; pushBot('...');
  const reply = await botReply(v);
  const last = $('chatBody').lastElementChild;
  if(last && last.textContent==='...') last.remove();
  pushBot(reply);
}

/* ══════════════════════════════════════════════════
   راه‌اندازی
   ══════════════════════════════════════════════════ */
async function init(){
  initTheme();
  initSupabase();

  isLoading = true;
  renderSkeleton(8);

  if(dbConnected) await dbLoadAll();
  isLoading = false;

  applyShopInfo();
  renderCategories();
  renderFooterCategories();
  renderProductCatOptions();
  renderProducts();
  updateCart();
  updateWishCount();
  updateUserBtn();

  // جستجوی هوشمند با debounce
  let searchTimeout;
  $('search').addEventListener('input', e=>{
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(()=>{
      searchQuery = e.target.value;
      renderProducts();
      go('home');
    }, 200);
  });

  $('cartBtn').onclick = openCart;
  $('wishBtn').onclick = ()=>go('wish');
  $('userBtn').onclick = openAuth;
  $('checkout').onclick = checkout;
}

init();
