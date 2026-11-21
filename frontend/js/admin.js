document.addEventListener("DOMContentLoaded", initializeAdmin);

let productFormUi;
const adminOrdersById = new Map();

async function initializeAdmin() {
    const content = document.getElementById("adminContent");
    const message = document.getElementById("adminMessage");
    try {
        const { user } = await apiRequest("/users/profile");
        if (user.role !== "admin") {
            message.textContent = "Administrator access is required.";
            message.classList.add("error");
            return;
        }
        content.hidden = false;
        message.hidden = true;
        wireProductForm();
        await refreshAdminData();
        document.getElementById("adminContent").addEventListener("click", handleAdminAction);
    } catch (error) {
        message.hidden = false;
        if (isSignedOut(error)) {
            location.replace(`login.html?next=${encodeURIComponent("admin.html")}`);
            return;
        }
        message.textContent = error.message;
        message.classList.add("error");
    }
}

async function refreshAdminData() {
    const [summaryData, productData, orderData, userData] = await Promise.all([
        apiRequest("/admin/summary"),
        apiRequest("/products"),
        apiRequest("/admin/orders"),
        apiRequest("/admin/users"),
    ]);
    renderSummary(summaryData.summary);
    renderAdminProducts(productData.products);
    renderAdminOrders(orderData.orders);
    renderAdminUsers(userData.users);
}

function renderSummary(summary) {
    document.getElementById("adminSummary").innerHTML = [
        ["Products", summary.products],
        ["Orders", summary.orders],
        ["Customers & admins", summary.users],
        ["Pending orders", summary.pendingOrders],
    ].map(([label, count]) => `<article class="admin-stat"><span>${label}</span><strong>${count}</strong></article>`).join("");
}

function renderAdminProducts(products) {
    const container = document.getElementById("adminProducts");
    if (!products.length) {
        container.innerHTML = '<p class="empty-state">No products yet. Add one above.</p>';
        return;
    }
    container.innerHTML = `<table class="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
    <tbody>${products.map((product) => `<tr>
      <td><strong>${escapeHTML(product.name)}</strong></td><td>${escapeHTML(product.category)}</td>
      <td>${money(product.price)}</td><td>${Number(product.stock || 0)}</td>
      <td class="table-actions"><button class="secondary-btn" data-edit-product="${escapeHTML(product._id)}">Edit</button>
      <button class="danger-btn" data-delete-product="${escapeHTML(product._id)}">Delete</button></td>
    </tr>`).join("")}</tbody></table>`;
}

function renderAdminOrders(orders) {
  const container = document.getElementById("adminOrders");
  adminOrdersById.clear();
  if (!orders.length) {
    container.innerHTML = '<p class="empty-state">No orders yet.</p>';
    return;
  }
  for (const order of orders) adminOrdersById.set(String(order._id), order);
  container.innerHTML = `<table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Manage</th></tr></thead>
    <tbody>${orders.map((order) => {
      const availableTransitions = {
        pending: ["processing", "cancelled"],
        processing: ["shipped", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
      }[order.status] || [];
      const paid = order.payment?.status === "paid";
      const transitions = paid
        ? availableTransitions.filter((status) => status !== "cancelled")
        : availableTransitions;
      const orderId = escapeHTML(order._id);
      return `<tr data-order-row="${orderId}"><td><strong>${orderId}</strong><small>${new Date(order.createdAt).toLocaleString()}</small></td>
        <td>${escapeHTML(order.customer?.name || "Account unavailable")}<small>${escapeHTML(order.customer?.email || "")}</small></td>
        <td>${money(order.total)}</td>
        <td><span class="payment-badge ${paid ? "paid" : "unpaid"}">${paid ? "Paid" : "Not paid"}</span><small>${paid ? `Manual · ${order.payment.paidAt ? new Date(order.payment.paidAt).toLocaleString() : "recorded"}` : "No payment recorded"}</small></td>
        <td><span class="status-badge">${escapeHTML(order.status)}</span></td>
        <td class="table-actions manage-order-actions">
          ${transitions.length ? `<select data-order-status="${orderId}" aria-label="Order status">${transitions.map((status) => `<option value="${status}">${status}</option>`).join("")}</select><button class="secondary-btn" data-update-order="${orderId}">Save status</button>` : ""}
          ${!paid && order.status !== "cancelled" ? `<button class="secondary-btn" data-mark-paid="${orderId}" title="Record that external payment has been received">Mark paid</button>` : ""}
          <button class="secondary-btn" data-order-details="${orderId}" aria-expanded="false">Details</button>
        </td></tr>`;
    }).join("")}</tbody></table>`;
}

function renderOrderDetails(order) {
  const items = order.items.map((item) => `
    <li><strong>${escapeHTML(item.name)}</strong> × ${item.quantity}
      <span>${money(item.unitPrice)} each · ${money(item.lineTotal)}</span></li>
  `).join("");
  const address = order.shippingAddress;
  const paid = order.payment?.status === "paid";
  return `<div class="order-detail-grid">
    <section><h3>Items</h3><ul>${items}</ul><p><strong>Total: ${money(order.total)}</strong></p></section>
    <section><h3>Customer</h3><p>${escapeHTML(order.customerDetails.name)}</p>
      <p>${escapeHTML(order.customerDetails.email)}</p><p>${escapeHTML(order.customerDetails.phone)}</p></section>
    <section><h3>Delivery address</h3><p>${escapeHTML(address.address)}</p>
      <p>${escapeHTML(address.city)}, ${escapeHTML(address.postalCode)}</p><p>${escapeHTML(address.country)}</p></section>
    <section><h3>Payment</h3><p>${paid ? "Paid (recorded manually)" : "Not paid / no payment recorded"}</p>
      ${paid && order.payment.paidAt ? `<p>Recorded ${new Date(order.payment.paidAt).toLocaleString()}</p>` : ""}
      <p>Checkout does not collect payment. Only mark paid after receiving payment outside the site.</p></section>
  </div>`;
}

function renderAdminUsers(users) {
  const container = document.getElementById("adminUsers");
  if (!users.length) {
    container.innerHTML = '<p class="empty-state">No accounts found.</p>';
    return;
  }
  container.innerHTML = `<table class="admin-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Update account</th></tr></thead>
    <tbody>${users.map((user) => `<tr><td><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.email)}</small><small>Joined ${new Date(user.createdAt).toLocaleDateString()}</small></td>
      <td><select data-user-role="${escapeHTML(user._id)}"><option value="customer" ${user.role === "customer" ? "selected" : ""}>Customer</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option></select></td>
      <td><select data-user-status="${escapeHTML(user._id)}"><option value="active" ${user.status === "active" ? "selected" : ""}>Active</option><option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Disabled</option></select></td>
      <td><button class="secondary-btn" data-update-user="${escapeHTML(user._id)}">Save</button></td></tr>`).join("")}</tbody></table>`;
}

function wireProductForm() {
  const form = document.getElementById("productForm");
  const imageInput = form.elements.imageFile;
  const imagePreview = document.getElementById("productImagePreview");
  const imageMessage = document.getElementById("productImageMessage");
  const formMessage = document.getElementById("productFormMessage");
  let previewUrl = null;
  const clearImagePreview = (message = "", messageType = "") => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    imagePreview.hidden = true;
    imagePreview.removeAttribute("src");
    imagePreview.onerror = null;
    imagePreview.onload = null;
    imageMessage.textContent = message;
    imageMessage.className = messageType ? `form-message ${messageType}` : "form-message";
  };
  const resetProductForm = () => {
    form.reset();
    form.elements.productId.value = "";
    form.elements.image.value = "";
    imageInput.required = true;
    clearImagePreview();
    formMessage.textContent = "";
    formMessage.className = "form-message";
  };
  productFormUi = { clearImagePreview, formMessage, imageMessage, imagePreview };

  document.getElementById("newProductButton").addEventListener("click", () => {
    resetProductForm();
    document.getElementById("productFormHeading").textContent = "Add product";
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    clearImagePreview();
    if (!file) {
      if (!form.elements.productId.value) imageMessage.textContent = "Choose an image for this product.";
      return;
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supportedTypes.includes(file.type)) {
      imageInput.value = "";
      imageMessage.textContent = "Choose a JPEG, PNG, WebP, or GIF image.";
      imageMessage.classList.add("error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      imageInput.value = "";
      imageMessage.textContent = "Image must be 5 MB or smaller.";
      imageMessage.classList.add("error");
      return;
    }
    previewUrl = URL.createObjectURL(file);
    imagePreview.src = previewUrl;
    imagePreview.onload = () => {
      imageMessage.textContent = "Image preview ready.";
      imageMessage.classList.add("success");
    };
    imagePreview.onerror = () => {
      clearImagePreview("The selected file could not be previewed. Try another image.", "error");
    };
    imagePreview.hidden = false;
  });
  document.getElementById("cancelProductButton").addEventListener("click", () => {
    form.hidden = true;
    resetProductForm();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.productId.value;
    const body = Object.fromEntries(
      [...new FormData(form)].filter(([key]) => !["productId", "imageFile"].includes(key)),
    );
    for (const key of ["price", "oldPrice", "stock"]) {
      if (body[key] === "") delete body[key];
      else if (body[key] !== undefined) body[key] = Number(body[key]);
    }
    const imageFile = imageInput.files[0];
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    formMessage.className = "form-message";
    formMessage.textContent = "";
    try {
      if (imageFile) {
        formMessage.textContent = "Uploading image…";
        const upload = new FormData();
        upload.append("image", imageFile);
        const { image } = await apiRequest("/products/images", {
          method: "POST",
          body: upload,
        });
        body.image = image;
      } else if (!body.image) {
        throw new Error("Choose a product image before saving.");
      }
      formMessage.textContent = "Saving product…";
      await apiRequest(id ? `/products/${encodeURIComponent(id)}` : "/products", {
        method: id ? "PUT" : "POST",
        body,
      });
      form.hidden = true;
      resetProductForm();
      formMessage.textContent = "Product saved successfully.";
      formMessage.classList.add("success");
      try {
        await refreshAdminData();
      } catch (error) {
        formMessage.textContent = `Product saved, but the inventory could not refresh: ${error.message}`;
        formMessage.classList.add("error");
        form.hidden = false;
      }
    } catch (error) {
      formMessage.textContent = error.status === 404
        ? "The running server does not have the product API updates yet. Restart NovaStore from the backend folder, then reload this page."
        : error.message;
      formMessage.classList.add("error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function handleAdminAction(event) {
  const edit = event.target.closest("[data-edit-product]");
  const remove = event.target.closest("[data-delete-product]");
  const updateOrder = event.target.closest("[data-update-order]");
  const orderDetails = event.target.closest("[data-order-details]");
  const markPaid = event.target.closest("[data-mark-paid]");
  const updateUser = event.target.closest("[data-update-user]");
  try {
    if (edit) {
      const { product } = await apiRequest(`/products/${encodeURIComponent(edit.dataset.editProduct)}`);
      const form = document.getElementById("productForm");
      for (const key of ["name", "category", "price", "oldPrice", "description", "stock"]) {
        form.elements[key].value = product[key] ?? "";
      }
      form.elements.image.value = product.image || "";
      form.elements.imageFile.value = "";
      form.elements.imageFile.required = false;
      productFormUi.clearImagePreview();
      productFormUi.formMessage.textContent = "";
      productFormUi.formMessage.className = "form-message";
      productFormUi.imagePreview.src = product.image || "";
      productFormUi.imagePreview.hidden = !product.image;
      productFormUi.imageMessage.textContent = product.image ? "Current product image." : "";
      productFormUi.imageMessage.className = "form-message";
      if (product.image) {
        productFormUi.imagePreview.onerror = () => {
          productFormUi.imagePreview.hidden = true;
          productFormUi.imageMessage.textContent = "The current image cannot be loaded. Choose a replacement image to update it.";
          productFormUi.imageMessage.className = "form-message error";
        };
        productFormUi.imagePreview.onload = () => {
          productFormUi.imageMessage.textContent = "Current product image.";
          productFormUi.imageMessage.className = "form-message";
        };
      }
      form.elements.productId.value = product._id;
      document.getElementById("productFormHeading").textContent = "Edit product and stock";
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (remove) {
      if (!window.confirm("Delete this product? Past order snapshots will be kept.")) return;
      await apiRequest(`/products/${encodeURIComponent(remove.dataset.deleteProduct)}`, { method: "DELETE" });
      await refreshAdminData();
    } else if (orderDetails) {
      const order = adminOrdersById.get(orderDetails.dataset.orderDetails);
      if (!order) throw new Error("Order details are unavailable. Refresh and try again.");
      const existing = orderDetails.closest("tr").nextElementSibling;
      if (existing?.classList.contains("order-details-row")) {
        existing.remove();
        orderDetails.setAttribute("aria-expanded", "false");
      } else {
        const detailRow = document.createElement("tr");
        detailRow.className = "order-details-row";
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.innerHTML = renderOrderDetails(order);
        detailRow.append(cell);
        orderDetails.closest("tr").after(detailRow);
        orderDetails.setAttribute("aria-expanded", "true");
      }
    } else if (markPaid) {
      const order = adminOrdersById.get(markPaid.dataset.markPaid);
      if (!order) throw new Error("Order is unavailable. Refresh and try again.");
      if (!window.confirm(`Confirm that payment of ${money(order.total)} has been received outside NovaStore?`)) return;
      await apiRequest(`/admin/orders/${encodeURIComponent(markPaid.dataset.markPaid)}/payment`, {
        method: "PATCH",
        body: { status: "paid" },
      });
      await refreshAdminData();
    } else if (updateOrder) {
      const id = updateOrder.dataset.updateOrder;
      const status = document.querySelector(`[data-order-status="${CSS.escape(id)}"]`).value;
      await apiRequest(`/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
      await refreshAdminData();
    } else if (updateUser) {
      const id = updateUser.dataset.updateUser;
      const role = document.querySelector(`[data-user-role="${CSS.escape(id)}"]`).value;
      const status = document.querySelector(`[data-user-status="${CSS.escape(id)}"]`).value;
      await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { role, status } });
      await refreshAdminData();
    }
  } catch (error) {
    window.alert(error.message);
  }
}