const API = import.meta.env.VITE_API_URL;

document.getElementById("root").innerHTML = `
  <h1>CipherChat</h1>
  <button id="ping">Ping API</button>
  <pre id="out"></pre>
`;

document.getElementById("ping").onclick = async () => {
  const res = await fetch(API + "/health");
  const data = await res.json();
  document.getElementById("out").textContent = JSON.stringify(data);
};
