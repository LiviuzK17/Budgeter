import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  databaseURL: "YOUR_FIREBASE_DATABASE_URL",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const families = {
  family1: { name: "Famiglia 1" },
  family2: { name: "Famiglia 2" }
};

const els = {
  userForm: document.getElementById("userForm"),
  userName: document.getElementById("userName"),
  userFamily: document.getElementById("userFamily"),
  userList: document.getElementById("userList"),
  expenseForm: document.getElementById("expenseForm"),
  expenseAmount: document.getElementById("expenseAmount"),
  expenseDescription: document.getElementById("expenseDescription"),
  expensePaidBy: document.getElementById("expensePaidBy"),
  expenseShared: document.getElementById("expenseShared"),
  expensesTable: document.getElementById("expensesTable"),
  totalExpenses: document.getElementById("totalExpenses"),
  sharedExpenses: document.getElementById("sharedExpenses"),
  quotaPerFamily: document.getElementById("quotaPerFamily"),
  family1Balance: document.getElementById("family1Balance"),
  family2Balance: document.getElementById("family2Balance"),
  family1NameLabel: document.getElementById("family1NameLabel"),
  family2NameLabel: document.getElementById("family2NameLabel")
};

els.family1NameLabel.textContent = families.family1.name;
els.family2NameLabel.textContent = families.family2.name;

let users = {};
let expenses = {};
let expensesChart, familiesChart;

function euro(n) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("it-IT");
}

function getFamilyName(familyId) {
  return families[familyId]?.name || familyId;
}

function renderUsers() {
  els.userList.innerHTML = Object.entries(users).map(([id, u]) => `
    <li>
      <span>${u.name}</span>
      <span>${getFamilyName(u.familyId)}</span>
    </li>
  `).join("");

  els.expensePaidBy.innerHTML = Object.entries(users).map(([id, u]) => `
    <option value="${id}">${u.name} (${getFamilyName(u.familyId)})</option>
  `).join("");
}

function renderExpenses() {
  const rows = Object.entries(expenses)
    .sort((a, b) => b[1].date - a[1].date)
    .map(([id, e]) => {
      const user = users[e.paidBy];
      const familyName = user ? getFamilyName(user.familyId) : "-";
      return `
        <tr>
          <td>${formatDate(e.date)}</td>
          <td>${e.description || "-"}</td>
          <td>${euro(e.amount)}</td>
          <td>${user ? user.name : "-"}</td>
          <td>${familyName}</td>
          <td><span class="badge ${e.splitBetweenFamilies ? "yes" : "no"}">${e.splitBetweenFamilies ? "SI" : "NO"}</span></td>
          <td><button class="actionBtn" data-delete="${id}">Elimina</button></td>
        </tr>
      `;
    }).join("");
  els.expensesTable.innerHTML = rows || `<tr><td colspan="7">Nessuna spesa inserita.</td></tr>`;
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => remove(ref(db, `expenses/${btn.dataset.delete}`)));
  });
}

function renderSummary() {
  const totalExpenses = Object.values(expenses).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const sharedExpenses = Object.values(expenses)
    .filter(e => e.splitBetweenFamilies)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const familyTotals = { family1: 0, family2: 0 };
  Object.values(expenses).forEach(e => {
    const u = users[e.paidBy];
    if (!u) return;
    familyTotals[u.familyId] += Number(e.amount || 0);
  });

  const quotaPerFamily = sharedExpenses / 2;
  const balance1 = familyTotals.family1 - quotaPerFamily;
  const balance2 = familyTotals.family2 - quotaPerFamily;

  els.totalExpenses.textContent = euro(totalExpenses);
  els.sharedExpenses.textContent = euro(sharedExpenses);
  els.quotaPerFamily.textContent = euro(quotaPerFamily);
  els.family1Balance.textContent = euro(balance1);
  els.family2Balance.textContent = euro(balance2);

  updateCharts(totalExpenses, sharedExpenses, familyTotals);
}

function updateCharts(totalExpenses, sharedExpenses, familyTotals) {
  const ctx1 = document.getElementById("expensesChart");
  const ctx2 = document.getElementById("familiesChart");

  if (expensesChart) expensesChart.destroy();
  if (familiesChart) familiesChart.destroy();

  expensesChart = new Chart(ctx1, {
    type: "doughnut",
    data: {
      labels: ["Da dividere", "Non da dividere"],
      datasets: [{
        data: [
          sharedExpenses,
          Math.max(0, totalExpenses - sharedExpenses)
        ],
        backgroundColor: ["#38bdf8", "#f97316"]
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e5e7eb" } }
      }
    }
  });

  familiesChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: [families.family1.name, families.family2.name],
      datasets: [{
        label: "Spese totali",
        data: [familyTotals.family1, familyTotals.family2],
        backgroundColor: ["#34d399", "#a78bfa"]
      }]
    },
    options: {
      scales: {
        x: { ticks: { color: "#e5e7eb" }, grid: { color: "#374151" } },
        y: { ticks: { color: "#e5e7eb" }, grid: { color: "#374151" } }
      },
      plugins: {
        legend: { labels: { color: "#e5e7eb" } }
      }
    }
  });
}

els.userForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.userName.value.trim();
  const familyId = els.userFamily.value;
  if (!name) return;
  const newUser = push(ref(db, "users"));
  await set(newUser, { name, familyId });
  els.userName.value = "";
});

els.expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Number(els.expenseAmount.value);
  const description = els.expenseDescription.value.trim();
  const paidBy = els.expensePaidBy.value;
  const splitBetweenFamilies = els.expenseShared.checked;

  if (!amount || !paidBy) return;

  const newExpense = push(ref(db, "expenses"));
  await set(newExpense, {
    amount,
    description,
    paidBy,
    splitBetweenFamilies,
    date: Date.now()
  });

  els.expenseAmount.value = "";
  els.expenseDescription.value = "";
  els.expenseShared.checked = true;
});

onValue(ref(db, "users"), (snap) => {
  users = snap.val() || {};
  renderUsers();
  renderExpenses();
  renderSummary();
});

onValue(ref(db, "expenses"), (snap) => {
  expenses = snap.val() || {};
  renderExpenses();
  renderSummary();
});