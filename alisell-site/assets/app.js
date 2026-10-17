/* Alisell app.js
   The home page stays as the static HTML in index.html.
   This script only takes over when the URL has ?page=... (or a search), and
   re-uses the header/footer already in the HTML. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app");
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) { return "\u20A6" + Number(n || 0).toLocaleString(); };
  var qs = new URLSearchParams(location.search);
  var page = qs.get("page") || ((qs.get("q") || qs.get("category")) ? "shop" : "home");

  /* ---------- cart (localStorage, guarded) ---------- */
  function getCart() { try { return JSON.parse(localStorage.getItem("alisell_cart") || "[]"); } catch (e) { return []; } }
  function setCart(c) { try { localStorage.setItem("alisell_cart", JSON.stringify(c)); } catch (e) {} chrome(); }
  function cartCount() { return getCart().reduce(function (n, i) { return n + i.qty; }, 0); }
  function addToCart(p, qty) {
    var c = getCart(), f = c.find(function (i) { return i.id === p.id; });
    if (f) f.qty += qty; else c.push({ id: p.id, name: p.name || p.title || "Product", price: Number(p.price) || 0, image: pickImg(p), qty: qty });
    setCart(c);
  }
  function pickImg(p) { return p.image || p.image_url || (p.images && p.images[0]) || ""; }

  /* ---------- firebase helpers ---------- */
  function wait(key, evt) {
    return new Promise(function (res, rej) {
      if (window[key]) return res(window[key]);
      var t = setTimeout(function () {
        rej(new Error("Could not connect to Firebase. Refresh the page. If it keeps failing, check your internet and that every file in the assets folder is uploaded."));
      }, 12000);
      window.addEventListener(evt, function () { clearTimeout(t); res(window[key]); }, { once: true });
    });
  }
  var data = function () { return wait("firebaseData", "firebase-data-ready"); };
  var fns = function () { return wait("firebaseFunctions", "firebase-functions-ready"); };
  function authReady() {
    return wait("firebaseAuth", "firebase-ready").then(function (a) { return a.authStateReady ? a.authStateReady() : null; }).then(function () { return window.firebaseAuth.currentUser; });
  }

  /* ---------- header: cart count + sign in/out ---------- */
  function chrome() {
    var cart = document.querySelector('.head-actions a[href*="cart"]');
    if (cart) cart.innerHTML = "&#128722; Cart (" + cartCount() + ")";
    var box = document.querySelector(".head-actions");
    if (!box) return;
    var link = box.querySelector("a[data-auth]") || box.querySelector('a[href*="page=login"]') || box.querySelector('a[href*="page=profile"]');
    if (!link) return;
    link.setAttribute("data-auth", "1");
    var out = box.querySelector("a[data-signout]"), u = window.firebaseAuth && window.firebaseAuth.currentUser;
    if (u) {
      var nm = String(u.displayName || u.email || u.phoneNumber || "Account").split(/[\s@]/)[0];
      link.textContent = "\uD83D\uDC64 " + nm; link.href = "index.html?page=profile";
      if (!out) { out = document.createElement("a"); out.setAttribute("data-signout", "1"); out.textContent = "Sign out"; link.insertAdjacentElement("afterend", out); }
      out.href = "#";
      out.onclick = function (e) { e.preventDefault(); window.firebaseAuthFns.signOutUser().then(function () { location.href = "index.html"; }); };
    } else {
      link.textContent = "Sign in"; link.href = "index.html?page=login";
      if (out) out.remove();
    }
  }
  function toast(msg) {
    var t = document.getElementById("al-toast");
    if (!t) { t = document.createElement("div"); t.id = "al-toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 4500);
  }
  function normalizePhone(v) {
    v = String(v || "").replace(/[\s()-]/g, "");
    if (v.charAt(0) === "+") return v;
    if (v.indexOf("234") === 0) return "+" + v;
    if (v.charAt(0) === "0") return "+234" + v.slice(1);
    return "+234" + v;
  }
  chrome();
  window.addEventListener("firebase-auth-changed", function (e) {
    chrome();
    var u = e.detail && e.detail.user;
    try {
      if (u && !sessionStorage.getItem("alisell_prof_" + u.uid)) {
        sessionStorage.setItem("alisell_prof_" + u.uid, "1");
        wait("firebaseData", "firebase-data-ready").then(function (d) { return d.ensureUserProfile(u); }).catch(function () {});
      }
    } catch (x) {}
  });
  if (page === "home") return;

  var HEADER = ["top", "header", "nav"].map(function (c) { var e = $("." + c); return e ? e.outerHTML : ""; }).join("");
  var FOOTER = ($(".footer") || { outerHTML: "" }).outerHTML;

  function render(html, bare) {
    var shell = !bare && app.querySelector("main.page");
    if (shell) shell.innerHTML = html;
    else { app.innerHTML = bare ? html : HEADER + '<main class="page container">' + html + "</main>" + FOOTER; window.scrollTo(0, 0); }
    document.documentElement.classList.remove("route-pending");
    chrome();
  }
  function note(msg) { var n = $("#msg"); if (n) { n.textContent = msg; n.style.display = msg ? "block" : "none"; } }
  function card(p) {
    var img = pickImg(p), name = p.name || p.title || "Product";
    return '<a class="product" href="index.html?page=product&id=' + encodeURIComponent(p.id) + '">' +
      (img ? '<img class="product-img" loading="lazy" alt="' + esc(name) + '" src="' + esc(img) + '">' : '<div class="product-img"></div>') +
      '<div class="product-body"><div>' + esc(name) + '</div><div class="price">' + money(p.price) + "</div>" +
      '<div class="rating">&#9733; ' + (p.rating ? Number(p.rating).toFixed(1) : "New") + "</div></div></a>";
  }
  function needLogin(u) {
    if (u) return false;
    location.replace("index.html?page=login&next=" + encodeURIComponent(location.search));
    return true;
  }
  var AUTH_MSG = {
    "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.", "auth/user-not-found": "No account with that email.",
    "auth/email-already-in-use": "That email already has an account. Sign in instead.", "auth/weak-password": "Password must be at least 6 characters.",
    "auth/operation-not-allowed": "This sign-in method is switched off. In Firebase Console > Authentication > Sign-in method, enable Email/Password (and Google).",
    "auth/unauthorized-domain": "This web address is not allowed. Add it in Firebase Console > Authentication > Settings > Authorized domains.",
    "auth/popup-closed-by-user": "The Google window was closed before finishing.", "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups and try again.",
    "auth/network-request-failed": "No internet connection, or the request was blocked.", "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/invalid-phone-number": "Enter a valid phone number, like 0803 123 4567 or +234 803 123 4567.", "auth/missing-phone-number": "Enter your phone number.",
    "auth/invalid-verification-code": "That code is not correct.", "auth/code-expired": "That code has expired. Request a new one.",
    "auth/captcha-check-failed": "Security check failed. Refresh the page and try again.", "auth/quota-exceeded": "SMS limit reached. Try again later.",
    "auth/requires-recent-login": "For your security, please sign in again and retry.", "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/account-exists-with-different-credential": "An account with this email already exists using a different sign-in method."
  };
  function authErr(e) { return AUTH_MSG[e && e.code] || errText(e); }
  function fbReady() {
    if (window.firebaseAuthFns) return true;
    note("Firebase did not load, so sign-in cannot work. Open this site through a local server (http://localhost:8000) or your hosting address, not by double-clicking the file.");
    return false;
  }
  function errText(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace("Firebase: ", "") : "Something went wrong"; }

  /* ---------- pages ---------- */
  var pages = {
    shop: async function () {
      render('<h1>Shop</h1><p class="muted">Loading products&hellip;</p>');
      try {
        var list = await (await data()).getProducts();
        var q = (qs.get("q") || "").toLowerCase(), cat = (qs.get("category") || "").toLowerCase();
        list = list.filter(function (p) {
          return (!q || ((p.name || p.title || "") + " " + (p.description || "")).toLowerCase().indexOf(q) > -1) &&
                 (!cat || String(p.category || "").toLowerCase() === cat);
        });
        render("<h1>Shop</h1>" + (list.length ? '<div class="product-grid">' + list.map(card).join("") + "</div>" : '<p class="muted">No products found.</p>'));
      } catch (e) { render('<h1>Shop</h1><div class="notice">' + esc(errText(e)) + "</div>"); }
    },

    product: async function () {
      render('<p class="muted">Loading&hellip;</p>');
      try {
        var p = await (await data()).getProduct(qs.get("id")), img = pickImg(p), name = p.name || p.title || "Product";
        render('<div class="detail">' + (img ? '<img class="detail-img" alt="' + esc(name) + '" src="' + esc(img) + '">' : '<div class="detail-img" style="background:#f4f5f6"></div>') +
          "<div><h1>" + esc(name) + '</h1><div class="price">' + money(p.price) + '</div><p class="muted">Sold by ' + esc(p.sellerName || "Seller") + "</p><p>" + esc(p.description || "") + "</p>" +
          '<div class="qty"><button id="minus">-</button><span id="q">1</span><button id="plus">+</button></div><p>' +
          '<button class="btn" id="add">Add to cart</button> <button class="btn alt" id="buy">Buy now</button></p></div></div>');
        var n = 1, q = $("#q");
        $("#minus").onclick = function () { n = Math.max(1, n - 1); q.textContent = n; };
        $("#plus").onclick = function () { n++; q.textContent = n; };
        $("#add").onclick = function () { addToCart(p, n); $("#add").textContent = "Added \u2713"; };
        $("#buy").onclick = function () { addToCart(p, n); location.href = "index.html?page=checkout"; };
      } catch (e) { render('<div class="notice">' + esc(errText(e)) + "</div>"); }
    },

    cart: function () {
      var c = getCart();
      if (!c.length) return render('<h1>Your cart</h1><p class="muted">Your cart is empty.</p><a class="btn" href="index.html?page=shop">Browse products</a>');
      var total = c.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
      render("<h1>Your cart</h1>" + '<div class="panel"><table class="table"><tr><th>Item</th><th>Price</th><th>Qty</th><th></th></tr>' +
        c.map(function (i, k) {
          return "<tr><td>" + esc(i.name) + "</td><td>" + money(i.price) + '</td><td><button data-d="' + k + '" data-v="-1">-</button> ' + i.qty +
            ' <button data-d="' + k + '" data-v="1">+</button></td><td><button data-rm="' + k + '">Remove</button></td></tr>';
        }).join("") + '</table><div class="summary-row total"><span>Total</span><span>' + money(total) + '</span></div><p><a class="btn" href="index.html?page=checkout">Checkout</a></p></div>');
      app.onclick = function (e) {
        var t = e.target, cc = getCart();
        if (t.dataset.d != null) { var it = cc[+t.dataset.d]; it.qty = Math.max(1, it.qty + +t.dataset.v); setCart(cc); pages.cart(); }
        if (t.dataset.rm != null) { cc.splice(+t.dataset.rm, 1); setCart(cc); pages.cart(); }
      };
    },

    checkout: async function () {
      var u = await authReady(); if (needLogin(u)) return;
      var c = getCart();
      if (!c.length) return render('<h1>Checkout</h1><p class="muted">Your cart is empty.</p>');
      var total = c.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
      render('<h1>Checkout</h1><div class="checkout"><form class="panel" id="f"><h3>Delivery details</h3><div id="msg" class="notice" style="display:none"></div>' +
        '<div class="field"><label>Full name</label><input name="name" required value="' + esc(u.displayName || "") + '"></div>' +
        '<div class="field"><label>Phone</label><input name="phone" required></div>' +
        '<div class="field"><label>Delivery address</label><textarea name="address" rows="3" required></textarea></div>' +
        '<button class="btn" id="pay">Pay ' + money(total) + "</button></form>" +
        '<div class="panel"><h3>Order summary</h3>' + c.map(function (i) { return '<div class="summary-row"><span>' + esc(i.name) + " x" + i.qty + "</span><span>" + money(i.price * i.qty) + "</span></div>"; }).join("") +
        '<div class="summary-row total"><span>Total</span><span>' + money(total) + "</span></div></div></div>");
      $("#f").onsubmit = async function (e) {
        e.preventDefault(); var f = e.target, b = $("#pay"); b.disabled = true; note("");
        try {
          var F = await fns();
          // ASSUMPTION: adjust these field names to what your createOrder Cloud Function expects.
          var order = await F.createOrder({ items: c.map(function (i) { return { productId: i.id, quantity: i.qty }; }), name: f.elements.name.value, phone: f.elements.phone.value, address: f.elements.address.value });
          var id = order.orderId || order.id;
          var pay = await F.initializePayment("order", id);
          try { localStorage.setItem("alisell_order_ref", pay.reference || ""); } catch (x) {}
          location.href = pay.authorization_url || pay.url || pay.authorizationUrl;
        } catch (err) { note(errText(err)); b.disabled = false; }
      };
    },

    confirmation: async function () {
      var ref = qs.get("reference") || "", box = function (t, body) {
        render('<div class="panel" style="text-align:center;max-width:520px;margin:auto"><h1>' + t + "</h1>" + body + "</div>");
      };
      box("Confirming payment&hellip;", '<p class="muted">Please wait a moment.</p>');
      var ok = false, msg = "";
      try {
        if (!ref) throw new Error("No payment reference found.");
        var u = await authReady(); if (needLogin(u)) return;
        var r = await (await fns()).verifyPayment(ref); ok = !!(r && r.paid);
        if (!ok) msg = "We could not confirm this payment yet. If you were charged, it will show in your orders shortly.";
      } catch (e) { msg = errText(e); }
      if (ok) { try { if (localStorage.getItem("alisell_order_ref") === ref) { localStorage.removeItem("alisell_cart"); localStorage.removeItem("alisell_order_ref"); chrome(); } } catch (x) {} }
      box(ok ? "Thank you!" : "Payment not confirmed", "<p>" + (ok ? "Your payment was confirmed." : esc(msg)) + '</p><p class="muted">Reference: ' + esc(ref) +
        '</p><a class="btn" href="index.html?page=orders">View my orders</a> <a class="btn alt" href="index.html?page=mybookings">My hotel bookings</a>');
    },

    orders: async function () {
      var u = await authReady(); if (needLogin(u)) return;
      render('<h1>My orders</h1><p class="muted">Loading&hellip;</p>');
      try {
        var rows = await (await data()).getOrders(), NOTE = '<div id="msg" class="notice" style="display:none"></div>';
        render("<h1>My orders</h1>" + NOTE + (rows.length ? '<div class="panel" style="overflow-x:auto"><table class="table"><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr>' +
          rows.map(function (o) {
            var items = (o.items || []).map(function (i) { return esc(i.name) + " &times;" + esc(i.quantity); }).join(", "), paid = o.payment_status === "paid", seller = o.items && o.items[0] && o.items[0].sellerUid;
            return "<tr><td>" + esc(o.id.slice(0, 8)) + "</td><td>" + o.created_at.toLocaleDateString() + "</td><td>" + items + "</td><td>" + money(o.total) + '</td><td><span class="badge">' + (paid ? "paid" : "unpaid") + '</span></td><td><span class="badge">' + esc(o.status || "placed") + "</span></td><td>" +
              (!paid && o.status !== "cancelled" ? '<button class="btn" data-payorder="' + o.id + '">Pay now</button>' : "") +
              (o.status === "delivered" && seller ? '<a class="btn alt" href="index.html?page=review&target=' + encodeURIComponent(seller) + "&order=" + o.id + '">Review</a>' : "") + "</td></tr>";
          }).join("") + "</table></div>" : '<p class="muted">You have no orders yet.</p><a class="btn" href="index.html?page=shop">Start shopping</a>'));
        app.onclick = async function (e) {
          var t = e.target; if (!t.dataset || !t.dataset.payorder) return;
          t.disabled = true;
          try {
            var pay = await (await fns()).initializePayment("order", t.dataset.payorder);
            location.href = pay.authorization_url || pay.url || pay.authorizationUrl;
          } catch (x) { note(errText(x)); t.disabled = false; }
        };
      } catch (e) { render('<div class="notice">' + esc(errText(e)) + "</div>"); }
    },

    login: function () { authPage("login"); },
    signup: function () { authPage("signup"); },

    sell: async function () {
      var u = await authReady(); if (needLogin(u)) return;
      render('<h1>Seller center</h1><p class="muted">Loading&hellip;</p>');
      var d = await data(), mine = [], sales = [];
      try { mine = await d.getProductsForSeller(u.uid); } catch (e) {}
      try { sales = (await d.getOrdersForSeller(u.uid)).filter(function (o) { return o.payment_status === "paid"; }); } catch (e) {}
      render('<h1>Seller center</h1><div id="msg" class="notice" style="display:none"></div>' +
        '<form class="panel" id="f"><h3>Add a product</h3>' +
        '<div class="field"><label>Name</label><input name="name" required></div>' +
        '<div class="field"><label>Price (\u20A6)</label><input name="price" type="number" min="1" required></div>' +
        '<div class="field"><label>Category</label><select name="category"><option>fashion</option><option>electronics</option><option>home</option><option>beauty</option><option>groceries</option><option>baby</option><option>sports</option><option>books</option></select></div>' +
        '<div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>' +
        '<div class="field"><label>Photo</label><input name="photo" type="file" accept="image/*"></div><button class="btn">Publish product</button></form>' +
        '<div class="panel" style="margin-top:15px"><h3>My products</h3>' + (mine.length ? mine.map(function (p) {
          return '<div class="summary-row"><span><a href="index.html?page=product&id=' + encodeURIComponent(p.id) + '">' + esc(p.name || p.title) + "</a> &middot; " + money(p.price) + '</span><button data-delprod="' + esc(p.id) + '">Delete</button></div>';
        }).join("") : '<p class="muted">No products yet.</p>') + "</div>" +
        '<div class="panel" style="margin-top:15px;overflow-x:auto"><h3>Sales</h3>' + (sales.length ? '<table class="table"><tr><th>Order</th><th>Date</th><th>Your items</th><th>Status</th></tr>' + sales.map(function (o) {
          var its = (o.items || []).filter(function (i) { return i.sellerUid === u.uid; });
          return "<tr><td>" + esc(o.id.slice(0, 8)) + "</td><td>" + o.created_at.toLocaleDateString() + "</td><td>" + its.map(function (i) { return esc(i.name) + " &times;" + esc(i.quantity); }).join(", ") + '</td><td><span class="badge">' + esc(o.status || "placed") + "</span></td></tr>";
        }).join("") + "</table>" : '<p class="muted">No paid orders yet.</p>') + "</div>");
      $("#f").onsubmit = async function (e) {
        e.preventDefault(); var f = e.target; note("Publishing\u2026");
        try {
          var image = "";
          if (f.elements.photo.files[0]) { await wait("firebaseStorageFns", "firebase-storage-ready"); image = await window.firebaseStorageFns.uploadListingImage(f.elements.photo.files[0]); }
          var p = await d.createProduct({ name: f.elements.name.value, price: Number(f.elements.price.value), category: f.elements.category.value, description: f.elements.description.value, image: image });
          location.href = "index.html?page=product&id=" + encodeURIComponent(p.id);
        } catch (err) { note(errText(err)); }
      };
      app.onclick = async function (e) {
        var t = e.target; if (!t.dataset || !t.dataset.delprod) return;
        if (!window.confirm("Delete this product?")) return;
        try { await d.deleteProduct(t.dataset.delprod); pages.sell(); } catch (x) { note(errText(x)); }
      };
    },

    profile: async function () {
      var u = await authReady(); if (needLogin(u)) return;
      render('<h1>My account</h1><p class="muted">Loading&hellip;</p>');
      var d = await data(), prof = {}, ver = null;
      try { prof = (await d.getUserProfile(u.uid)) || {}; } catch (e) {}
      try { ver = await d.getVerificationRequest(u.uid); } catch (e) {}
      var LBL = { seller: "Seller", host: "Hotel owner", restaurant: "Restaurant owner", landlord: "Property lister", agent: "Delivery agent", admin: "Admin" },
          DASH = { seller: ["sell", "Seller center"], host: ["host", "Hotel dashboard"], restaurant: ["myrestaurant", "Restaurant dashboard"], landlord: ["listings", "My property listings"], agent: ["agent", "Delivery jobs"], admin: ["admin", "Admin panel"] },
          roles = prof.roles || [], provs = (u.providerData || []).map(function (p) { return p.providerId; }),
          hasPw = provs.indexOf("password") > -1, hasGoogle = provs.indexOf("google.com") > -1,
          name = u.displayName || prof.name || "", who = u.email || u.phoneNumber || "",
          initial = (name || who || "?").trim().charAt(0).toUpperCase(), photo = u.photoURL || prof.photoURL || "";
      function chips() {
        var c = roles.map(function (r) { return '<span class="chip">' + esc(LBL[r] || r) + "</span>"; }).join("") || '<span class="chip">Customer</span>';
        if (prof.verified) c += '<span class="chip ok">&#10003; Verified</span>';
        if (u.email) c += u.emailVerified ? '<span class="chip ok">Email verified</span>' : '<span class="chip warn">Email not verified</span>';
        return c;
      }
      var links = [["orders", "My orders"], ["mybookings", "My hotel bookings"], ["myreservations", "My table reservations"]]
        .concat(roles.filter(function (r) { return DASH[r]; }).map(function (r) { return DASH[r]; }))
        .map(function (l) { return '<a href="index.html?page=' + l[0] + '"><span>' + l[1] + "</span><span>&rsaquo;</span></a>"; }).join("");
      var verBlock = ver ? '<p>Latest identity request (' + esc(LBL[ver.role] || ver.role || "") + '): <span class="badge">' + esc(ver.status) + "</span>" + (ver.note ? " &mdash; " + esc(ver.note) : "") + "</p>" : '<p class="muted">Want to sell, list a hotel, restaurant or property, or deliver orders? Verify your identity once.</p>';
      render('<h1>My account</h1><div id="msg" class="notice" style="display:none"></div>' +
        '<div class="panel"><div class="profile-head"><div id="avatarBox">' + (photo ? '<img class="avatar-lg" id="avatarImg" alt="" src="' + esc(photo) + '">' : '<div class="avatar-lg" id="avatarImg">' + esc(initial) + "</div>") + "</div>" +
        '<div style="flex:1;min-width:200px"><h2 style="margin:0" id="phName">' + esc(name || "Your name") + '</h2><div class="muted">' + esc(who) + '</div><div class="chips">' + chips() + "</div></div>" +
        '<div><label class="btn alt" style="cursor:pointer">Change photo<input id="photoIn" type="file" accept="image/*" style="display:none"></label>' +
        (u.email && !u.emailVerified ? ' <button class="btn ghost" id="verMail" type="button">Verify email</button>' : "") + "</div></div></div>" +
        '<div class="profile-grid"><div>' +
        '<form class="panel" id="pf"><h3>Personal details</h3>' +
        '<div class="field"><label>Full name</label><input name="name" required minlength="2" maxlength="80" value="' + esc(name) + '"></div>' +
        '<div class="field"><label>Phone number</label><input name="phone" type="tel" maxlength="20" value="' + esc(prof.phone || "") + '" placeholder="0803 123 4567"></div>' +
        '<div class="field"><label>City</label><input name="city" maxlength="60" value="' + esc(prof.city || "") + '"></div>' +
        '<div class="field"><label>Address</label><input name="address" maxlength="200" value="' + esc(prof.address || "") + '"></div>' +
        '<div class="field"><label>About me</label><textarea name="bio" rows="3" maxlength="300">' + esc(prof.bio || "") + "</textarea></div>" +
        '<button class="btn" id="saveBtn">Save changes</button></form>' +
        '<div class="panel" style="margin-top:15px"><h3>Identity verification</h3>' + verBlock + '<a class="btn alt" href="index.html?page=verify">' + (ver ? "Open verification" : "Get verified") + "</a></div>" +
        "</div><div>" +
        '<div class="panel"><h3>Quick links</h3><div class="link-list">' + links + "</div></div>" +
        '<div class="panel" style="margin-top:15px"><h3>Security</h3>' +
        (hasPw ? '<p class="muted" style="margin-top:0">Forgot or want a new password? We will email you a reset link.</p><button class="btn ghost" id="pwReset" type="button">Send password reset email</button> ' : '<p class="muted" style="margin-top:0">You sign in with ' + (hasGoogle ? "Google" : "your phone number") + ".</p>") +
        '<button class="btn ghost" id="signOut" type="button">Sign out</button></div>' +
        '<form class="panel danger" id="del" style="margin-top:15px"><h3 style="color:#c62828">Delete account</h3>' +
        '<p class="muted" style="margin-top:0">This permanently deletes your profile, your listings and your uploaded documents. Order and booking records are kept for other people, but your name, phone and address are removed. This cannot be undone.</p>' +
        (hasPw ? '<div class="field"><label>Your password</label><input name="password" type="password" autocomplete="current-password"></div>' : "") +
        '<div class="field"><label>Type DELETE to confirm</label><input name="confirm" autocomplete="off"></div>' +
        '<button class="btn danger" id="delBtn">Delete my account</button></form>' +
        "</div></div>");
      var A = window.firebaseAuthFns;
      $("#pf").onsubmit = async function (e) {
        e.preventDefault(); var f = e.target, b = $("#saveBtn"); note(""); b.disabled = true; b.textContent = "Saving\u2026";
        try {
          var nm = f.elements.name.value.trim();
          await A.updateDisplayName(nm);
          await d.ensureUserProfile(u, { name: nm, phone: f.elements.phone.value.trim(), city: f.elements.city.value.trim(), address: f.elements.address.value.trim(), bio: f.elements.bio.value.trim() });
          $("#phName").textContent = nm; if (!photo) $("#avatarImg").textContent = nm.charAt(0).toUpperCase(); chrome(); toast("Profile saved");
        } catch (err) { note(errText(err)); }
        b.disabled = false; b.textContent = "Save changes";
      };
      $("#photoIn").onchange = async function (e) {
        var file = e.target.files[0]; if (!file) return; note("Uploading photo\u2026");
        try {
          await wait("firebaseStorageFns", "firebase-storage-ready");
          var url = await window.firebaseStorageFns.uploadAvatar(file);
          $("#avatarBox").innerHTML = '<img class="avatar-lg" id="avatarImg" alt="" src="' + esc(url) + '">'; photo = url; note(""); toast("Photo updated");
        } catch (err) { note(errText(err)); }
      };
      var vm = $("#verMail");
      if (vm) vm.onclick = async function () { try { await A.sendVerificationEmail(); toast("Verification email sent. Check your inbox."); } catch (err) { note(authErr(err)); } };
      var pr = $("#pwReset");
      if (pr) pr.onclick = async function () { try { await A.resetPassword(u.email); toast("Password reset email sent."); } catch (err) { note(authErr(err)); } };
      $("#signOut").onclick = function () { A.signOutUser().then(function () { location.href = "index.html"; }); };
      $("#del").onsubmit = async function (e) {
        e.preventDefault(); var f = e.target, b = $("#delBtn"); note("");
        if (f.elements.confirm.value.trim() !== "DELETE") return note("Type DELETE (in capital letters) to confirm.");
        if (hasPw && !f.elements.password.value) return note("Enter your password to confirm.");
        if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
        b.disabled = true; b.textContent = "Deleting\u2026";
        try {
          if (hasPw) await A.reauthWithPassword(f.elements.password.value);
          else if (hasGoogle) await A.reauthWithGoogle();
          await (await fns()).deleteAccount();
          try { await A.signOutUser(); } catch (x) {}
          try { localStorage.removeItem("alisell_cart"); } catch (x) {}
          render('<div class="panel" style="text-align:center;max-width:520px;margin:auto"><h1>Your account has been deleted</h1><p class="muted">Thank you for being part of Alisell. You are welcome back any time.</p><a class="btn" href="index.html">Back to home</a></div>');
        } catch (err) {
          var m = authErr(err); if (/recent|confirm it is you/i.test(m) && !hasPw && !hasGoogle) m = "For your security, sign out, sign in again with your phone number, then delete your account straight away.";
          note(m); b.disabled = false; b.textContent = "Delete my account";
        }
      };
    }
  };

  function authPage(mode) {
    var up = mode === "signup", G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
    render('<div class="auth-wrap"><div class="auth-card"><div class="auth-head"><span class="auth-orb o1"></span><span class="auth-orb o2"></span><a class="logo" href="index.html"><span class="logo-mark"></span>Alisell</a><p>Shop global. Deliver local.</p></div>' +
      '<div class="auth-body"><div class="auth-tabs"><a href="index.html?page=login"' + (up ? "" : ' class="on"') + '>Sign in</a><a href="index.html?page=signup"' + (up ? ' class="on"' : "") + ">Create account</a></div>" +
      '<div id="msg" class="notice" style="display:none"></div>' +
      '<button class="btn-google" id="g" type="button">' + G + "<span>Continue with Google</span></button>" +
      '<div class="auth-or"><span>or use</span></div>' +
      '<div class="auth-method"><button type="button" id="mEmail" class="on">&#9993; Email</button><button type="button" id="mPhone">&#128241; Phone</button></div>' +
      '<form id="f">' + (up ? '<div class="field"><label>Full name</label><input name="name" required autocomplete="name"></div>' : "") +
      '<div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>' +
      '<div class="field"><label>Password</label><input name="password" type="password" minlength="6" required autocomplete="' + (up ? "new-password" : "current-password") + '"></div>' +
      '<button class="btn" style="width:100%">' + (up ? "Create account" : "Sign in") + "</button></form>" +
      '<div id="panelPhone" style="display:none">' + (up ? '<div class="field"><label>Full name</label><input id="phoneName" autocomplete="name"></div>' : "") +
      '<div class="field"><label>Phone number</label><input id="phone" type="tel" placeholder="0803 123 4567 or +234&hellip;" autocomplete="tel"></div>' +
      '<div class="field" id="codeWrap" style="display:none"><label>6-digit code</label><input id="phoneCode" inputmode="numeric" maxlength="6" placeholder="Code from the SMS" autocomplete="one-time-code"></div>' +
      '<div id="recaptcha-container"></div><button class="btn" style="width:100%" id="sendCode" type="button">Send code</button><button class="btn" style="width:100%;display:none" id="verifyCode" type="button">Verify &amp; continue</button></div>' +
      (up ? "" : '<button class="auth-link" id="reset" type="button">Forgot password?</button>') +
      '<p class="auth-foot">' + (up ? 'Already have an account? <a href="index.html?page=login">Sign in</a>' : 'New to Alisell? <a href="index.html?page=signup">Create an account</a>') + "</p></div></div></div>", true);
    var done = async function (res) {
      // Save the profile in the background, but never let a slow database keep you on the sign-in form.
      try {
        await Promise.race([
          data().then(function (d) { return d.ensureUserProfile(res.user); }),
          new Promise(function (r) { setTimeout(r, 2000); })
        ]);
      } catch (e) {}
      var next = qs.get("next");
      location.href = next && /^\?[\w=&%.\-]+$/.test(next) ? "index.html" + next : "index.html";
    };
    var setMethod = function (m) {
      var ph = m === "phone";
      $("#f").style.display = ph ? "none" : ""; $("#panelPhone").style.display = ph ? "" : "none";
      $("#mEmail").classList.toggle("on", !ph); $("#mPhone").classList.toggle("on", ph); note("");
    };
    $("#mEmail").onclick = function () { setMethod("email"); };
    $("#mPhone").onclick = function () { setMethod("phone"); };
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("");
      if (!fbReady()) return;
      try { await done(up ? await window.firebaseAuthFns.signUp(f.elements.name.value, f.elements.email.value, f.elements.password.value) : await window.firebaseAuthFns.signIn(f.elements.email.value, f.elements.password.value)); }
      catch (err) { note(authErr(err)); }
    };
    $("#g").onclick = async function () {
      if (!fbReady()) return; note("");
      try { await done(await window.firebaseAuthFns.signInWithGoogle()); } catch (err) { note(authErr(err)); }
    };
    $("#sendCode").onclick = async function () {
      if (!fbReady()) return; note("");
      var phone = normalizePhone($("#phone").value), b = $("#sendCode");
      if (phone.length < 11) return note("Enter a valid phone number.");
      b.disabled = true; b.textContent = "Sending\u2026";
      try {
        await window.firebaseAuthFns.startPhoneSignIn(phone, "recaptcha-container");
        $("#codeWrap").style.display = ""; $("#verifyCode").style.display = ""; b.textContent = "Resend code"; $("#phoneCode").focus();
        toast("Code sent to " + phone);
      } catch (err) { b.textContent = "Send code"; note(authErr(err)); }
      b.disabled = false;
    };
    $("#verifyCode").onclick = async function () {
      if (!fbReady()) return; note("");
      var code = $("#phoneCode").value.trim(), b = $("#verifyCode");
      if (code.length < 6) return note("Enter the 6-digit code.");
      b.disabled = true;
      try { await done(await window.firebaseAuthFns.confirmPhoneCode(code, up ? $("#phoneName").value.trim() : "")); }
      catch (err) { note(authErr(err)); b.disabled = false; }
    };
    var r = $("#reset");
    if (r) r.onclick = async function () {
      try { await window.firebaseAuthFns.resetPassword($("#f").elements.email.value); note("Password reset email sent. Check your inbox."); } catch (err) { note(errText(err)); }
    };
  }

  var api = { $: $, esc: esc, money: money, pages: pages, qs: qs, render: render, note: note, data: data, fns: fns, authReady: authReady, needLogin: needLogin, errText: errText, wait: wait };
  /* ---- hotels, host, properties, agent, verify, review, admin ---- */
  (function (A) {
  var $ = A.$, esc = A.esc, money = A.money, P = A.pages, qs = A.qs, R = A.render, note = A.note;
  var reload = function () { return pages[page](); };

  function fld(n, l, t, x) {
    return '<div class="field"><label>' + l + "</label>" +
      (t === "textarea" ? '<textarea name="' + n + '" rows="3"></textarea>' : '<input name="' + n + '" type="' + (t || "text") + '" ' + (x || "") + ">") + "</div>";
  }
  function sel(n, l, opts) {
    return '<div class="field"><label>' + l + '</label><select name="' + n + '">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select></div>";
  }
  function tile(href, x, title, sub, price) {
    var i = x.image || (x.images && x.images[0]) || "";
    return '<a class="product" href="' + href + '">' + (i ? '<img class="product-img" loading="lazy" alt="" src="' + esc(i) + '">' : '<div class="product-img"></div>') +
      '<div class="product-body"><div>' + esc(title) + '</div><div class="muted">' + esc(sub || "") + '</div><div class="price">' + price + "</div></div></a>";
  }
  function pg(fn, login) {
    return async function () {
      R('<p class="muted">Loading&hellip;</p>');
      try {
        var u = await A.authReady();
        if (login && A.needLogin(u)) return;
        await fn(u);
      } catch (e) { R('<div class="notice">' + esc(A.errText(e)) + "</div>"); }
    };
  }
  function click(map) {
    document.getElementById("app").onclick = async function (e) {
      var t = e.target;
      for (var k in map) if (t.dataset && t.dataset[k] != null) {
        e.preventDefault();
        try { await map[k](t.dataset[k], t); } catch (x) { note(A.errText(x)); }
      }
    };
  }
  async function photo(f) {
    var x = f.elements.photo && f.elements.photo.files[0]; if (!x) return "";
    await A.wait("firebaseStorageFns", "firebase-storage-ready");
    return window.firebaseStorageFns.uploadListingImage(x);
  }
  var MSG = '<div id="msg" class="notice" style="display:none"></div>';
  var ROLE_NAME = { seller: "seller", host: "hotel owner", restaurant: "restaurant owner", landlord: "property lister", agent: "delivery agent" };
  // Only verified owners get past this. Customers never see it because they never open these pages.
  async function gate(u, role) {
    var d = await A.data(), p = (await d.getUserProfile(u.uid)) || {}, v = await d.getVerificationRequest(u.uid);
    if ((p.roles || []).indexOf(role) > -1) return true;
    var mine = v && v.role === role, pend = mine && v.status === "pending", rej = mine && v.status === "rejected";
    R("<h1>Verification needed</h1>" + '<div class="panel"><p>This area is for verified ' + ROLE_NAME[role] + "s. " +
      (pend ? "Your verification is being reviewed. Please check back soon." : rej ? "Your last request was rejected" + (v.note ? ": " + esc(v.note) : "") + ". You can submit it again." : "Verify your identity once and you can list and manage here.") + "</p>" +
      (pend ? "" : '<a class="btn" href="index.html?page=verify&role=' + role + '">Verify as ' + ROLE_NAME[role] + "</a> ") + '<a class="btn alt" href="index.html">Back to browsing</a></div>');
    return false;
  }
  var origSell = P.sell;
  P.sell = pg(async function (u) { if (!(await gate(u, "seller"))) return; await origSell(); }, true);
  var rows = function (list, fn, empty) { return list.length ? list.map(fn).join("") : '<p class="muted">' + empty + "</p>"; };

  /* ---------------- Hotels ---------------- */
  var parseRooms = function (t) {
    return String(t || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 20).map(function (l) {
      var m = l.match(/^(.*?)\s*[-:]\s*(\d[\d,]*)(?:\s*[-:]\s*(\d+))?\s*$/);
      return m ? { name: m[1], price: Number(m[2].replace(/,/g, "")), count: Math.max(1, +m[3] || 1) } : null;
    }).filter(Boolean);
  };
  var roomsOf = function (h) { return h.rooms && h.rooms.length ? h.rooms : [{ name: "Standard", price: Number(h.price) || 0, count: 99 }]; };
  async function photos(f) {
    var fl = f.elements.photos && f.elements.photos.files, out = [];
    if (!fl || !fl.length) return out;
    await A.wait("firebaseStorageFns", "firebase-storage-ready");
    for (var k = 0; k < Math.min(4, fl.length); k++) out.push(await window.firebaseStorageFns.uploadListingImage(fl[k]));
    return out;
  }
  var payRedirect = async function (id) {
    var pay = await (await A.fns()).initializePayment("booking", id);
    location.href = pay.authorization_url || pay.url || pay.authorizationUrl;
  };

  P.hotels = pg(async function () {
    R('<h1>Hotels</h1><p class="muted">Loading&hellip;</p>');
    var l = await (await A.data()).getHotels(), city = (qs.get("city") || "").toLowerCase(), max = Number(qs.get("max")) || 0;
    l = l.filter(function (h) { return (!city || String(h.city || "").toLowerCase().indexOf(city) > -1) && (!max || Number(h.price) <= max); });
    R('<h1>Hotels</h1><form class="toolbar" method="get" action="index.html"><input type="hidden" name="page" value="hotels"><input name="city" placeholder="City" value="' + esc(qs.get("city") || "") + '"><input name="max" type="number" min="1" placeholder="Max price per night" value="' + esc(qs.get("max") || "") + '"><button class="btn">Filter</button></form>' +
      '<p><a class="btn alt" href="index.html?page=host">List your hotel</a> <a class="btn alt" href="index.html?page=mybookings">My bookings</a></p>' +
      (l.length ? '<div class="product-grid">' + l.map(function (h) { return tile("index.html?page=hotel&id=" + h.id, h, h.name, h.city, "from " + money(h.price) + " / night"); }).join("") + "</div>" : '<p class="muted">No hotels match.</p>'));
  });

  P.hotel = pg(async function () {
    var h = await (await A.data()).getHotel(qs.get("id")), rooms = roomsOf(h), imgs = h.images && h.images.length ? h.images : (h.image ? [h.image] : []), today = new Date().toISOString().slice(0, 10);
    R('<div class="detail"><div>' + (imgs[0] ? '<img class="detail-img" id="big" alt="" src="' + esc(imgs[0]) + '">' : '<div class="detail-img" style="background:#f4f5f6"></div>') +
      (imgs.length > 1 ? '<p>' + imgs.map(function (s) { return '<img data-pic="' + esc(s) + '" alt="" src="' + esc(s) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin:4px;cursor:pointer">'; }).join("") + "</p>" : "") + "</div>" +
      "<div><h1>" + esc(h.name) + '</h1><p class="muted">' + esc(h.city || "") + (h.address ? " &middot; " + esc(h.address) : "") + "</p>" +
      (h.amenities && h.amenities.length ? "<p>" + h.amenities.map(function (x) { return '<span class="badge">' + esc(x) + "</span> "; }).join("") + "</p>" : "") + "<p>" + esc(h.description || "") + "</p>" +
      '<form id="f">' + MSG + sel("roomType", "Room type", rooms.map(function (r) { return [esc(r.name), esc(r.name) + " - " + money(r.price) + " / night"]; })) +
      fld("checkIn", "Check-in", "date", 'required min="' + today + '"') + fld("checkOut", "Check-out", "date", 'required min="' + today + '"') + fld("guests", "Guests", "number", "min=1 value=1 required") +
      '<p><b id="tot"></b></p><button class="btn">Book and pay</button></form></div></div>');
    var f = $("#f");
    function upd() {
      var n = Math.round((new Date(f.elements.checkOut.value) - new Date(f.elements.checkIn.value)) / 864e5), r = rooms[f.elements.roomType.selectedIndex] || rooms[0];
      $("#tot").textContent = n > 0 ? n + " night" + (n > 1 ? "s" : "") + " = " + money(n * r.price) : "";
    }
    ["roomType", "checkIn", "checkOut"].forEach(function (k) { f.elements[k].onchange = upd; });
    document.getElementById("app").onclick = function (e) { var s = e.target.dataset && e.target.dataset.pic; if (s) $("#big").src = s; };
    f.onsubmit = async function (e) {
      e.preventDefault(); note("");
      if (!(new Date(f.elements.checkOut.value) > new Date(f.elements.checkIn.value))) return note("Check-out must be after check-in.");
      try {
        var u = await A.authReady(); if (A.needLogin(u)) return;
        var b = await (await A.fns()).createBooking({ hotelId: h.id, roomType: f.elements.roomType.value, checkIn: f.elements.checkIn.value, checkOut: f.elements.checkOut.value, guests: +f.elements.guests.value });
        await payRedirect(b.bookingId || b.id);
      } catch (x) { note(A.errText(x)); }
    };
  });

  P.mybookings = pg(async function () {
    var l = await (await A.data()).getBookingsForCustomer();
    R("<h1>My bookings</h1>" + rows(l, function (b) {
      var unpaid = b.payment_status !== "paid" && b.status !== "cancelled";
      return '<div class="panel" style="margin-bottom:10px"><b>' + esc(b.hotelName || b.hotelId) + "</b> &middot; " + esc(b.roomType || "") + "<br>" + esc(b.checkIn) + " to " + esc(b.checkOut) + " &middot; " + money(b.total) +
        ' <span class="badge">' + esc(b.status || "pending") + '</span> <span class="badge">' + (b.payment_status === "paid" ? "paid" : "unpaid") + "</span><br>" +
        (unpaid ? '<button class="btn" data-pay="' + b.id + '">Pay now</button> <button data-cancel="' + b.id + '">Cancel</button> ' : "") +
        (b.status === "confirmed" ? '<a class="btn alt" href="index.html?page=review&target=' + encodeURIComponent(b.hotelOwnerUid) + "&booking=" + b.id + '">Leave a review</a>' : "") + "</div>";
    }, "No bookings yet.") + MSG);
    click({
      pay: async function (id) { await payRedirect(id); },
      cancel: async function (id) { await (await A.fns()).updateBookingStatus(id, "cancelled"); reload(); }
    });
  }, true);

  P.host = pg(async function (u) {
    if (!(await gate(u, "host"))) return;
    var d = await A.data(), hs = await d.getHotelsForOwner(u.uid), bk = await d.getBookingsForHotelOwner(u.uid);
    R("<h1>Hotel owner</h1>" + MSG +
      '<form class="panel" id="f"><h3>Add a hotel</h3>' + fld("name", "Hotel name", "text", "required") + fld("city", "City", "text", "required") + fld("address", "Street address", "text") + fld("amenities", "Amenities (comma separated, e.g. WiFi, Parking, Pool)", "text") +
      '<div class="field"><label>Room types (one per line: name - price per night - how many rooms). Example: Standard - 20000 - 5</label><textarea name="rooms" rows="4" required></textarea></div>' +
      fld("description", "Description", "textarea") + fld("photos", "Photos (up to 4)", "file", 'accept="image/*" multiple') + '<button class="btn">Add hotel</button></form>' +
      '<div class="panel" style="margin-top:15px"><h3>My hotels</h3>' + rows(hs, function (h) { return '<div class="summary-row"><span>' + esc(h.name) + " &middot; from " + money(h.price) + '</span><button data-delh="' + h.id + '">Delete</button></div>'; }, "None yet.") + "</div>" +
      '<div class="panel" style="margin-top:15px"><h3>Bookings</h3>' + rows(bk, function (b) {
        var paid = b.payment_status === "paid";
        return '<div class="summary-row"><span>' + esc(b.hotelName || b.hotelId) + " &middot; " + esc(b.roomType || "") + " &middot; " + esc(b.checkIn) + " to " + esc(b.checkOut) + " &middot; " + esc(b.guests) + " guests &middot; " + money(b.total) + " &middot; " + esc(b.status || "pending") + " &middot; " + (paid ? "paid" : "unpaid") +
          "</span><span>" + (paid && b.status !== "confirmed" && b.status !== "cancelled" ? '<button data-bk="confirmed" data-id="' + b.id + '">Confirm</button> ' : "") + (b.status !== "cancelled" ? '<button data-bk="cancelled" data-id="' + b.id + '">Cancel</button>' : "") + "</span></div>";
      }, "No bookings.") + "</div>");
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target, rooms = parseRooms(f.elements.rooms.value); note("Saving\u2026");
      if (!rooms.length) return note("Add at least one room type, like: Standard - 20000 - 5");
      try {
        var imgs = await photos(f);
        await d.createHotel({ name: f.elements.name.value, city: f.elements.city.value, address: f.elements.address.value, amenities: f.elements.amenities.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20),
          rooms: rooms, price: Math.min.apply(null, rooms.map(function (r) { return r.price; })), description: f.elements.description.value, images: imgs, image: imgs[0] || "" });
        reload();
      } catch (x) { note(A.errText(x)); }
    };
    click({
      delh: async function (id) { await d.deleteHotel(id); reload(); },
      bk: async function (s, t) { await (await A.fns()).updateBookingStatus(t.dataset.id, s); reload(); }
    });
  }, true);

  /* ---------------- Properties ---------------- */
  var TYPES = [["house_rent", "House for rent"], ["house_sale", "House for sale"], ["land_sale", "Land for sale"]];
  var typeName = function (v) { var t = TYPES.filter(function (x) { return x[0] === v; })[0]; return t ? t[1] : v || ""; };

  P.properties = pg(async function () {
    R('<h1>Properties</h1><p class="muted">Loading&hellip;</p>');
    var t = qs.get("type"), l = await (await A.data()).getProperties();
    if (t) l = l.filter(function (p) { return p.type === t; });
    R("<h1>Properties</h1><p>" + TYPES.map(function (x) { return '<a class="btn alt" href="index.html?page=properties&type=' + x[0] + '">' + x[1] + "</a> "; }).join("") +
      '<a class="btn" href="index.html?page=listings">List a property</a></p>' +
      (l.length ? '<div class="product-grid">' + l.map(function (p) { return tile("index.html?page=property&id=" + p.id, p, p.title, typeName(p.type) + (p.city ? ", " + p.city : ""), money(p.price)); }).join("") + "</div>" : '<p class="muted">No properties found.</p>'));
  });

  P.property = pg(async function () {
    var p = await (await A.data()).getProperty(qs.get("id")), i = p.image || (p.images && p.images[0]) || "";
    R('<div class="detail">' + (i ? '<img class="detail-img" alt="" src="' + esc(i) + '">' : '<div class="detail-img" style="background:#f4f5f6"></div>') +
      "<div><h1>" + esc(p.title) + '</h1><p class="muted">' + esc(typeName(p.type)) + " &middot; " + esc(p.city || "") + '</p><div class="price">' + money(p.price) + "</div><p>" + esc(p.description || "") + "</p>" +
      '<form id="f"><h3>Contact the lister</h3>' + MSG + fld("phone", "Your phone", "tel", "required") + fld("message", "Message", "textarea") + '<button class="btn">Send enquiry</button></form></div></div>');
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("");
      try {
        var u = await A.authReady(); if (A.needLogin(u)) return;
        await (await A.data()).createPropertyLead({ propertyId: p.id, propertyTitle: p.title, ownerUid: p.ownerUid, phone: f.elements.phone.value, message: f.elements.message.value });
        f.reset(); note("Enquiry sent. The lister will contact you.");
      } catch (x) { note(A.errText(x)); }
    };
  });

  P.listings = pg(async function (u) {
    if (!(await gate(u, "landlord"))) return;
    var d = await A.data(), ps = await d.getPropertiesForOwner(u.uid), ls = await d.getLeadsForOwner(u.uid);
    R("<h1>My property listings</h1>" + MSG +
      '<form class="panel" id="f"><h3>Add a property</h3>' + fld("title", "Title", "text", "required") + sel("type", "Type", TYPES) + fld("city", "City", "text", "required") + fld("price", "Price (\u20A6)", "number", "min=1 required") + fld("description", "Description", "textarea") + fld("photo", "Photo", "file", 'accept="image/*"') + '<button class="btn">Publish</button></form>' +
      '<div class="panel" style="margin-top:15px"><h3>My properties</h3>' + rows(ps, function (p) { return '<div class="summary-row"><span>' + esc(p.title) + '</span><button data-delp="' + p.id + '">Delete</button></div>'; }, "None yet.") + "</div>" +
      '<div class="panel" style="margin-top:15px"><h3>Enquiries</h3>' + rows(ls, function (l) { return '<div class="summary-row"><span><b>' + esc(l.customerName) + "</b> (" + esc(l.phone) + ") on " + esc(l.propertyTitle || "") + ": " + esc(l.message || "") + "</span></div>"; }, "No enquiries.") + "</div>");
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("Saving\u2026");
      try { await d.createProperty({ title: f.elements.title.value, type: f.elements.type.value, city: f.elements.city.value, price: +f.elements.price.value, description: f.elements.description.value, image: await photo(f) }); reload(); } catch (x) { note(A.errText(x)); }
    };
    click({ delp: async function (id) { await d.deleteProperty(id); reload(); } });
  }, true);

  /* ---------------- Restaurants ---------------- */
  var menuText = function (m) { return (m || []).map(function (x) { return x.name + " - " + x.price; }).join("\n"); };
  var parseMenu = function (t) {
    return String(t || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 60).map(function (l) {
      var m = l.match(/^(.*?)[\s\-:]+(\d[\d,]*)\s*$/); return m ? { name: m[1], price: Number(m[2].replace(/,/g, "")) } : { name: l, price: 0 };
    });
  };
  P.restaurants = pg(async function () {
    R('<h1>Restaurants</h1><p class="muted">Loading&hellip;</p>');
    var l = await (await A.data()).getRestaurants();
    R('<h1>Restaurants</h1><p><a class="btn alt" href="index.html?page=myrestaurant">List your restaurant</a> <a class="btn alt" href="index.html?page=myreservations">My reservations</a></p>' +
      (l.length ? '<div class="product-grid">' + l.map(function (x) { return tile("index.html?page=restaurant&id=" + x.id, x, x.name, (x.cuisine || "") + (x.city ? " \u00B7 " + x.city : ""), ""); }).join("") + "</div>" : '<p class="muted">No restaurants yet.</p>'));
  });
  P.restaurant = pg(async function () {
    var r = await (await A.data()).getRestaurant(qs.get("id")), i = r.image || "";
    R('<div class="detail">' + (i ? '<img class="detail-img" alt="" src="' + esc(i) + '">' : '<div class="detail-img" style="background:#f4f5f6"></div>') +
      "<div><h1>" + esc(r.name) + '</h1><p class="muted">' + esc(r.cuisine || "") + " &middot; " + esc(r.city || "") + "</p><p>" + esc(r.description || "") + "</p>" +
      "<h3>Menu</h3>" + rows(r.menu || [], function (m) { return '<div class="summary-row"><span>' + esc(m.name) + "</span><span>" + (m.price ? money(m.price) : "") + "</span></div>"; }, "Menu coming soon.") +
      '<form id="f"><h3>Reserve a table</h3>' + MSG + fld("date", "Date", "date", "required") + fld("time", "Time", "time", "required") + fld("guests", "Guests", "number", "min=1 value=2 required") + '<button class="btn">Request table</button></form></div></div>');
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("");
      try {
        var u = await A.authReady(); if (A.needLogin(u)) return;
        await (await A.fns()).createReservation({ restaurantId: r.id, date: f.elements.date.value, time: f.elements.time.value, guests: +f.elements.guests.value });
        note("Table requested. The restaurant will confirm it.");
      } catch (x) { note(A.errText(x)); }
    };
  });
  P.myreservations = pg(async function () {
    var l = await (await A.data()).getReservationsForCustomer();
    R("<h1>My reservations</h1>" + rows(l, function (b) {
      return '<div class="panel" style="margin-bottom:10px"><b>' + esc(b.restaurantName || b.restaurantId) + "</b><br>" + esc(b.date) + " at " + esc(b.time) + " &middot; " + esc(b.guests) + ' guests <span class="badge">' + esc(b.status || "pending") + "</span></div>";
    }, "No reservations yet."));
  }, true);
  P.myrestaurant = pg(async function (u) {
    if (!(await gate(u, "restaurant"))) return;
    var d = await A.data(), rs = await d.getRestaurantsForOwner(u.uid), bk = await d.getReservationsForOwner(u.uid);
    R("<h1>Restaurant owner</h1>" + MSG +
      '<form class="panel" id="f"><h3>Add a restaurant</h3>' + fld("name", "Name", "text", "required") + fld("city", "City", "text", "required") + fld("cuisine", "Cuisine (e.g. Hausa, Continental)", "text") + fld("description", "Description", "textarea") +
      '<div class="field"><label>Menu (one item per line, like: Jollof rice - 2500)</label><textarea name="menu" rows="5"></textarea></div>' + fld("photo", "Photo", "file", 'accept="image/*"') + '<button class="btn">Add restaurant</button></form>' +
      '<div class="panel" style="margin-top:15px"><h3>My restaurants</h3>' + rows(rs, function (x) { return '<div class="summary-row"><span>' + esc(x.name) + '</span><button data-delr="' + x.id + '">Delete</button></div>'; }, "None yet.") + "</div>" +
      '<div class="panel" style="margin-top:15px"><h3>Reservations</h3>' + rows(bk, function (b) {
        return '<div class="summary-row"><span>' + esc(b.restaurantName) + " &middot; " + esc(b.customerName || "") + " &middot; " + esc(b.date) + " " + esc(b.time) + " &middot; " + esc(b.guests) + " guests &middot; " + esc(b.status || "pending") +
          '</span><span><button data-rs="confirmed" data-id="' + b.id + '">Confirm</button> <button data-rs="cancelled" data-id="' + b.id + '">Decline</button></span></div>';
      }, "No reservations.") + "</div>");
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("Saving\u2026");
      try { await d.createRestaurant({ name: f.elements.name.value, city: f.elements.city.value, cuisine: f.elements.cuisine.value, description: f.elements.description.value, menu: parseMenu(f.elements.menu.value), image: await photo(f) }); reload(); } catch (x) { note(A.errText(x)); }
    };
    click({
      delr: async function (id) { await d.deleteRestaurant(id); reload(); },
      rs: async function (s, t) { await (await A.fns()).updateReservationStatus(t.dataset.id, s); reload(); }
    });
  }, true);

  /* ---------------- Delivery agent ---------------- */
  P.agent = pg(async function (u) {
    if (!(await gate(u, "agent"))) return;
    var d = await A.data(), open = [], mine = [];
    try { open = await d.getUnassignedOrders(); } catch (e) {}
    mine = await d.getOrdersForAgent(u.uid);
    var line = function (o) { return "Order " + esc(o.id.slice(0, 8)) + " &middot; " + esc(o.address || o.deliveryAddress || "") + " &middot; " + money(o.total); };
    R("<h1>Delivery agent</h1>" + MSG +
      '<div class="panel"><h3>Available orders</h3>' + rows(open, function (o) { return '<div class="summary-row"><span>' + line(o) + '</span><button class="btn" data-claim="' + o.id + '">Claim</button></div>'; }, "No orders waiting.") + "</div>" +
      '<div class="panel" style="margin-top:15px"><h3>My deliveries</h3>' + rows(mine, function (o) {
        return '<div class="summary-row"><span>' + line(o) + ' <span class="badge">' + esc(o.status || "assigned") + "</span></span>" + (o.status === "delivered" ? "" : '<button class="btn" data-done="' + o.id + '">Mark delivered</button>') + "</div>";
      }, "Nothing claimed yet.") + "</div>");
    click({
      claim: async function (id) { await (await A.fns()).claimOrder(id); reload(); },
      done: async function (id) { await (await A.fns()).markOrderDelivered(id); reload(); }
    });
  }, true);

  /* ---------------- Verification ---------------- */
  P.verify = pg(async function (u) {
    var d = await A.data(), v = await d.getVerificationRequest(u.uid), want = qs.get("role") || (v && v.role) || "host";
    var opts = Object.keys(ROLE_NAME).map(function (k) { return [k, ROLE_NAME[k]]; });
    R("<h1>Verify your identity</h1>" + MSG + '<p class="muted">Customers do not need this. It is only for people who want to sell, list or deliver on Alisell.</p>' +
      (v ? "<p>Latest request (" + esc(ROLE_NAME[v.role] || v.role || "") + '): <span class="badge">' + esc(v.status) + "</span>" + (v.note ? " &mdash; " + esc(v.note) : "") + "</p>" : "") +
      '<form class="panel" id="f">' + sel("role", "I want to join as a", opts) + fld("businessName", "Business or trading name", "text", "required") + fld("address", "Business or home address", "text", "required") +
      fld("addressProof", "Proof of address (photo)", "file", 'accept="image/*" required') + fld("selfie", "Selfie holding your ID", "file", 'accept="image/*" required') + '<button class="btn">Submit for review</button></form>');
    $("#f").elements.role.value = want;
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("Uploading\u2026");
      try {
        await A.wait("firebaseStorageFns", "firebase-storage-ready");
        var S = window.firebaseStorageFns, x = await S.uploadVerificationDoc(f.elements.addressProof.files[0], "addressProof"), y = await S.uploadVerificationDoc(f.elements.selfie.files[0], "selfie");
        await (await A.fns()).submitVerification({ role: f.elements.role.value, businessName: f.elements.businessName.value, address: f.elements.address.value, addressProofPath: x.path, selfiePath: y.path });
        note("Submitted. We will review it shortly.");
      } catch (err) { note(A.errText(err)); }
    };
  }, true);

  /* ---------------- Reviews ---------------- */
  P.review = pg(async function () {
    R("<h1>Leave a review</h1>" + MSG + '<form class="panel" id="f">' + sel("rating", "Rating", [[5, "5 - Excellent"], [4, "4 - Good"], [3, "3 - Okay"], [2, "2 - Poor"], [1, "1 - Bad"]]) + fld("comment", "Comment", "textarea") + '<button class="btn">Submit review</button></form>');
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target; note("");
      try {
        await (await A.fns()).createReview({ targetUid: qs.get("target"), orderId: qs.get("order") || null, bookingId: qs.get("booking") || null, rating: +f.elements.rating.value, comment: f.elements.comment.value });
        note("Thank you for your review.");
      } catch (x) { note(A.errText(x)); }
    };
  }, true);

  /* ---------------- Admin ---------------- */
  P.admin = pg(async function () {
    var F = await A.fns(), d = await A.data(), ov = await F.getAdminOverview(), pv = await d.getPendingVerifications();
    R("<h1>Admin</h1>" + MSG + '<div class="stats">' + Object.keys(ov || {}).filter(function (k) { return typeof ov[k] !== "object"; }).map(function (k) {
      return '<div class="stat"><span class="muted">' + esc(k) + '</span><div class="num">' + esc(ov[k]) + "</div></div>";
    }).join("") + "</div>" +
      '<div class="panel" style="margin-top:15px"><h3>Pending verifications</h3>' + rows(pv, function (v) {
        return '<div class="summary-row"><span>' + esc(v.name || v.id) + ' (' + esc(ROLE_NAME[v.role] || v.role || '?') + (v.businessName ? ', ' + esc(v.businessName) : '') + ') <a href="#" data-doc="addressProof" data-u="' + v.id + '">address proof</a> <a href="#" data-doc="selfie" data-u="' + v.id + '">selfie</a></span>' +
          '<span><button class="btn" data-rv="approved" data-u="' + v.id + '">Approve</button> <button data-rv="rejected" data-u="' + v.id + '">Reject</button></span></div>';
      }, "Nothing pending.") + "</div>" +
      '<form class="panel" id="f" style="margin-top:15px"><h3>Set a user role</h3>' + fld("uid", "User ID", "text", "required") + sel("role", "Role", [["customer", "customer"], ["seller", "seller"], ["host", "hotel owner"], ["restaurant", "restaurant owner"], ["landlord", "property lister"], ["agent", "delivery agent"], ["admin", "admin"]]) + '<button class="btn">Update role</button></form>');
    $("#f").onsubmit = async function (e) {
      e.preventDefault(); var f = e.target;
      try { await F.setUserRole(f.elements.uid.value.trim(), f.elements.role.value); note("Role updated."); } catch (x) { note(A.errText(x)); }
    };
    click({
      doc: async function (kind, t) { var r = await F.getVerificationDocumentUrl(t.dataset.u, kind); window.open(r.url || r.signedUrl, "_blank"); },
      rv: async function (decision, t) { await F.reviewVerification(t.dataset.u, decision, ""); reload(); }
    });
  }, true);
})(api);

  // Safety net: any error that slips through is shown instead of leaving a stale or blank page.
  window.addEventListener("unhandledrejection", function (e) { if (e.preventDefault) e.preventDefault(); toast(errText(e.reason)); });

  (pages[page] || function () { render('<h1>Page not found</h1><a class="btn" href="index.html">Go home</a>'); })();
})();
