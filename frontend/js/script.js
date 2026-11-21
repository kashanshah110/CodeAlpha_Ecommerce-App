const menuToggle = document.getElementById("menuToggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => navLinks.classList.toggle("show"));
}

const apiOrigin =
  window.NOVASTORE_API_ORIGIN ||
  (window.location.protocol === "file:"
    ? "http://localhost:5000"
    : window.location.port === "5500"
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : window.location.origin);
const API_BASE_URL = `${apiOrigin.replace(/\/$/, "")}/api`;
let csrfTokenPromise;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseApiResponse(response) {
  if (response.status === 204) return {};
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      response.ok
        ? "The API returned an unexpected response."
        : `The API could not complete the request (${response.status}).`,
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError("The API returned invalid JSON.", response.status);
  }
}

async function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`${API_BASE_URL}/csrf`, { credentials: "include" })
      .then(async (response) => {
        const data = await parseApiResponse(response);
        if (!response.ok) throw new ApiError(data.message || "Could not start a secure session.", response.status);
        return data.csrfToken;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body !== undefined && typeof body !== "string" && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: "include",
  });
  const data = await parseApiResponse(response);
  if (!response.ok) throw new ApiError(data.message || "The request could not be completed.", response.status);
  if (path === "/users/login" || path === "/users/logout") csrfTokenPromise = null;
  return data;
}

function isSignedOut(error) {
  return error instanceof ApiError && error.status === 401;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function updateCartCount(count = 0) {
  document.querySelectorAll("#cartCount").forEach((element) => {
    element.textContent = String(count);
  });
}

async function refreshCartCount() {
  try {
    const { cart } = await apiRequest("/cart");
    updateCartCount(cart.itemCount);
  } catch (error) {
    if (isSignedOut(error)) updateCartCount(0);
    else console.error("Could not refresh cart count:", error.message);
  }
}

async function updateAccountNavigation() {
  const profileLink = document.querySelector(".profile-nav-link");
  let adminLink = document.querySelector(".admin-nav-link");
  if (!adminLink && navLinks) {
    adminLink = document.createElement("a");
    adminLink.className = "admin-nav-link";
    adminLink.href = "admin.html";
    adminLink.textContent = "Admin";
    adminLink.hidden = true;
    navLinks.append(adminLink);
  }
  if (!profileLink && !adminLink) return;
  try {
    const { user } = await apiRequest("/users/profile");
    if (profileLink) {
      profileLink.href = "profile.html";
      profileLink.title = `Signed in as ${user.name}`;
      profileLink.setAttribute("aria-label", `My profile (${user.name})`);
    }
    if (adminLink) adminLink.hidden = user.role !== "admin";
  } catch (error) {
    if (isSignedOut(error)) {
      if (profileLink) {
        profileLink.href = "login.html";
        profileLink.title = "Sign in";
        profileLink.setAttribute("aria-label", "Sign in");
      }
      if (adminLink) adminLink.hidden = true;
    } else {
      console.error("Could not check account navigation:", error.message);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  refreshCartCount();
  updateAccountNavigation();
});
