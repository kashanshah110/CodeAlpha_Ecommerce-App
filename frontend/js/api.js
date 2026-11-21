async function loadProductsFromApi() {
  const { products } = await apiRequest("/products");
  return products;
}