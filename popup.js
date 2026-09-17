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
    value.textContent = formatAmount((amount * sourceRate) / rates[code]);

    row.append(label, value);
    results.append(row);
  }

  status.textContent = `Официальный курс на ${rates.date} · Банк России`;
}

async function loadRates() {
  try {
    const response = await fetch(
      "https://www.cbr.ru/scripts/XML_daily.asp",
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xmlText = new TextDecoder("windows-1251").decode(await response.arrayBuffer());
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.documentElement.nodeName !== "ValCurs" || xml.querySelector("parsererror")) {
      throw new Error("Неверный формат ответа");
    }

    const nextRates = { RUB: 1, date: xml.documentElement.getAttribute("Date") };
    for (const valute of xml.getElementsByTagName("Valute")) {
      const code = valute.getElementsByTagName("CharCode")[0]?.textContent?.trim();
      if (!currencies.includes(code) || code === "RUB") continue;

      const nominal = Number(valute.getElementsByTagName("Nominal")[0]?.textContent);
      const value = Number(valute.getElementsByTagName("Value")[0]?.textContent?.replace(",", "."));
      if (Number.isFinite(nominal) && nominal > 0 && Number.isFinite(value) && value > 0) {
        nextRates[code] = value / nominal;
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
