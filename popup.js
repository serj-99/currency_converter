const defaultCurrencies = ["RUB", "EUR", "USD", "KZT"];
const symbols = { RUB: "₽", EUR: "€", USD: "$", KZT: "₸" };
const names = { RUB: "Российский рубль" };

const amountInput = document.querySelector("#amount");
const currencySelect = document.querySelector("#currency");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const converter = document.querySelector("#converter");
const settings = document.querySelector("#settings");
const settingsButton = document.querySelector("#settings-button");
const currencySearch = document.querySelector("#currency-search");
const currencyList = document.querySelector("#currency-list");
const settingsHint = document.querySelector("#settings-hint");

let selectedCodes = [...defaultCurrencies];
let rates = null;
let loadError = false;
let storageError = false;
let saveQueue = Promise.resolve();
let saveVersion = 0;

function formatAmount(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
  }).format(value);
}

function renderSourceOptions() {
  const previous = currencySelect.value;
  currencySelect.replaceChildren();

  for (const code of selectedCodes) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} · ${symbols[code] || names[code] || code}`;
    currencySelect.append(option);
  }

  currencySelect.value = selectedCodes.includes(previous) ? previous : selectedCodes[0];
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
  for (const code of selectedCodes) {
    if (code === source) continue;

    const row = document.createElement("li");
    row.className = "result";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = `${names[code] || code} · ${code}`;

    const value = document.createElement("strong");
    value.textContent = formatAmount((amount * rates[source]) / rates[code]);

    row.append(label, value);
    results.append(row);
  }

  status.textContent = `Официальный курс на ${rates.date} · Банк России`;
}

function renderSettings() {
  const scrollTop = currencyList.scrollTop;
  currencyList.replaceChildren();
  if (!rates) {
    settingsHint.textContent = loadError
      ? "Список валют недоступен. Откройте окно снова после подключения к интернету."
      : "Загрузка списка валют…";
    return;
  }

  const search = currencySearch.value.trim().toLocaleLowerCase("ru-RU");
  const availableCodes = Object.keys(rates)
    .filter((code) => code !== "date")
    .sort((a, b) => a.localeCompare(b));

  for (const code of availableCodes) {
    const name = names[code] || code;
    if (search && !`${code} ${name}`.toLocaleLowerCase("ru-RU").includes(search)) continue;

    const label = document.createElement("label");
    label.className = "currency-choice";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = code;
    checkbox.checked = selectedCodes.includes(code);
    checkbox.addEventListener("change", () => changeSelection(code, checkbox));

    const text = document.createElement("span");
    text.textContent = `${code} · ${name}`;
    label.append(checkbox, text);
    currencyList.append(label);
  }

  settingsHint.textContent = storageError
    ? "Не удалось сохранить выбор. После закрытия окна он может сброситься."
    : `Выбрано: ${selectedCodes.length}. Оставьте минимум две валюты.`;
  currencyList.scrollTop = scrollTop;
}

async function changeSelection(code, checkbox) {
  if (checkbox.checked) {
    selectedCodes.push(code);
  } else if (selectedCodes.length > 2) {
    selectedCodes = selectedCodes.filter((item) => item !== code);
  } else {
    checkbox.checked = true;
    settingsHint.textContent = "Оставьте минимум две валюты.";
    return;
  }

  renderSourceOptions();
  render();
  renderSettings();

  const currentVersion = ++saveVersion;
  const codesToSave = [...selectedCodes];
  saveQueue = saveQueue.catch(() => {}).then(() =>
    browser.storage.local.set({ selectedCurrencies: codesToSave })
  );
  try {
    await saveQueue;
    if (currentVersion === saveVersion) {
      storageError = false;
      renderSettings();
    }
  } catch (error) {
    if (currentVersion === saveVersion) {
      storageError = true;
      renderSettings();
    }
    console.error("Ошибка сохранения валют:", error);
  }
}

async function loadRates() {
  try {
    const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xmlText = new TextDecoder("windows-1251").decode(await response.arrayBuffer());
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.documentElement.nodeName !== "ValCurs" || xml.querySelector("parsererror")) {
      throw new Error("Неверный формат ответа");
    }

    const nextRates = { RUB: 1, date: xml.documentElement.getAttribute("Date") };
    for (const valute of xml.getElementsByTagName("Valute")) {
      const code = valute.getElementsByTagName("CharCode")[0]?.textContent?.trim();
      if (!/^[A-Z]{3}$/.test(code || "")) continue;

      const nominal = Number(valute.getElementsByTagName("Nominal")[0]?.textContent);
      const value = Number(valute.getElementsByTagName("Value")[0]?.textContent?.replace(",", "."));
      if (!Number.isFinite(nominal) || nominal <= 0 || !Number.isFinite(value) || value <= 0) {
        continue;
      }

      nextRates[code] = value / nominal;
      names[code] = valute.getElementsByTagName("Name")[0]?.textContent?.trim() || code;
    }

    if (Object.keys(nextRates).length < 4 || !nextRates.date) {
      throw new Error("Получены не все курсы");
    }

    rates = nextRates;
    selectedCodes = selectedCodes.filter((code) => rates[code] > 0);
    if (selectedCodes.length < 2) {
      selectedCodes = defaultCurrencies.filter((code) => rates[code] > 0);
    }
    if (selectedCodes.length < 2) {
      selectedCodes = Object.keys(rates).filter((code) => code !== "date").slice(0, 2);
    }

    renderSourceOptions();
    render();
    renderSettings();
  } catch (error) {
    loadError = true;
    render();
    renderSettings();
    console.error("Ошибка загрузки курсов:", error);
  }
}

async function initialize() {
  try {
    const saved = await browser.storage.local.get("selectedCurrencies");
    if (Array.isArray(saved.selectedCurrencies)) {
      const codes = saved.selectedCurrencies.filter(
        (code) => typeof code === "string" && /^[A-Z]{3}$/.test(code)
      );
      if (new Set(codes).size >= 2) selectedCodes = [...new Set(codes)];
    }
  } catch (error) {
    storageError = true;
    console.error("Ошибка чтения настроек:", error);
  }

  await loadRates();
}

settingsButton.addEventListener("click", () => {
  const opening = settings.hidden;
  settings.hidden = !opening;
  converter.hidden = opening;
  settingsButton.setAttribute("aria-expanded", String(opening));
  settingsButton.setAttribute("aria-label", opening ? "Закрыть настройки" : "Открыть настройки");
  if (opening) currencySearch.focus();
  else amountInput.focus();
});
currencySearch.addEventListener("input", renderSettings);
amountInput.addEventListener("input", render);
currencySelect.addEventListener("change", render);
initialize();
