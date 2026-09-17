const currencies = ["RUB", "EUR", "USD", "KZT"];
const names = {
  RUB: "Российский рубль",
  EUR: "Евро",
  USD: "Доллар США",
  KZT: "Казахстанский тенге",
};

const amountInput = document.querySelector("#amount");
const currencySelect = document.querySelector("#currency");
const results = document.querySelector("#results");
const status = document.querySelector("#status");

let rates = null;
let loadError = false;

function formatAmount(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
  }).format(value);
}

function render() {
  results.replaceChildren();

  const rawAmount = amountInput.value.trim().replace(",", ".");
  if (rawAmount === "") {
    status.textContent = loadError
      ? "Не удалось загрузить курсы. Проверьте подключение и откройте окно снова."
      : rates ? "Введите сумму для пересчёта." : "Загрузка курсов…";
    return;
  }

  const amount = Number(rawAmount);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawAmount) || !Number.isFinite(amount)) {
    status.textContent = "Введите неотрицательное число.";
    return;
  }

  if (!rates) {
    status.textContent = loadError
      ? "Не удалось загрузить курсы. Проверьте подключение и откройте окно снова."
      : "Загрузка курсов…";
    return;
  }

  const source = currencySelect.value;
  const sourceRate = rates[source];
  for (const code of currencies) {
    if (code === source) continue;

    const row = document.createElement("li");
    row.className = "result";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = `${names[code]} · ${code}`;

    const value = document.createElement("strong");
    value.textContent = formatAmount((amount / sourceRate) * rates[code]);

    row.append(label, value);
    results.append(row);
  }

  status.textContent = `Курс на ${rates.date} · Frankfurter`;
}

async function loadRates() {
  try {
    const response = await fetch(
      "https://api.frankfurter.dev/v2/rates?base=USD&quotes=RUB,EUR,KZT",
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Неверный формат ответа");

    const nextRates = { USD: 1 };
    for (const row of rows) {
      if (
        currencies.includes(row.quote) &&
        row.base === "USD" &&
        Number.isFinite(row.rate) &&
        row.rate > 0
      ) {
        nextRates[row.quote] = row.rate;
        nextRates.date = row.date;
      }
    }
    if (!currencies.every((code) => nextRates[code] > 0) || !nextRates.date) {
      throw new Error("Получены не все курсы");
    }

    rates = nextRates;
    render();
  } catch (error) {
    loadError = true;
    render();
    console.error("Ошибка загрузки курсов:", error);
  }
}

amountInput.addEventListener("input", render);
currencySelect.addEventListener("change", render);
loadRates();
