(() => {
  const LOCAL_STORAGE_KEY = "daybook-budget-v1";
  const HANDLE_DATABASE_NAME = "daybook-csv-storage-v1";
  const HANDLE_STORE_NAME = "handles";
  const HANDLE_KEY = "live-csv";

  let csvHandle = null;

  function loadState(onError) {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
      return {
        transactions: Array.isArray(saved.transactions) ? saved.transactions.filter(item =>
          item && typeof item.id === "string" && typeof item.description === "string" &&
          Number.isFinite(item.amount) && item.amount > 0 &&
          (item.type === "income" || item.type === "expense") &&
          typeof item.category === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
        ) : [],
        budgets: saved.budgets && typeof saved.budgets === "object" && !Array.isArray(saved.budgets)
          ? saved.budgets : {},
        recurringExpenses: Array.isArray(saved.recurringExpenses) ? saved.recurringExpenses.filter(item =>
          item && typeof item.id === "string" && typeof item.description === "string" &&
          Number.isFinite(item.amount) && item.amount > 0 && typeof item.category === "string" &&
          Number.isInteger(item.day) && item.day >= 1 && item.day <= 31 &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(item.startMonth)
        ) : [],
        recurringIncomes: Array.isArray(saved.recurringIncomes) ? saved.recurringIncomes.filter(item =>
          item && typeof item.id === "string" && typeof item.description === "string" &&
          Number.isFinite(item.amount) && item.amount > 0 && typeof item.category === "string" &&
          Number.isInteger(item.day) && item.day >= 1 && item.day <= 31 &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(item.startMonth)
        ) : [],
        recurringSkips: Array.isArray(saved.recurringSkips) ? saved.recurringSkips.filter(item =>
          item && typeof item.recurringId === "string" &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(item.month)
        ) : []
      };
    } catch (error) {
      console.error("Could not read the saved budget.", error);
      if (onError) onError("Saved data could not be read.");
      return { transactions: [], budgets: {}, recurringExpenses: [], recurringIncomes: [], recurringSkips: [] };
    }
  }

  function saveLocalCopy(state) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Could not save the budget.", error);
      return false;
    }
  }

  function escapeCsv(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function serializeState(state) {
    const rows = [["record", "id", "description", "amount", "type", "category", "date", "month", "budget",
      "recurring_id", "recurring_day", "start_month"]];
    for (const transaction of state.transactions) {
      rows.push(["transaction", transaction.id, transaction.description, transaction.amount,
        transaction.type, transaction.category, transaction.date, "", "",
        transaction.recurringId || "", "", ""]);
    }
    for (const [month, amount] of Object.entries(state.budgets)) {
      rows.push(["budget", "", "", "", "", "", "", month, amount, "", "", ""]);
    }
    for (const recurring of state.recurringExpenses) {
      rows.push(["recurring", recurring.id, recurring.description, recurring.amount,
        "expense", recurring.category, "", recurring.startMonth, "", "", recurring.day, recurring.startMonth]);
    }
    for (const recurring of state.recurringIncomes) {
      rows.push(["recurring_income", recurring.id, recurring.description, recurring.amount,
        "income", recurring.category, "", recurring.startMonth, "", "", recurring.day, recurring.startMonth]);
    }
    for (const skipped of state.recurringSkips) {
      rows.push(["skip", skipped.recurringId, "", "", "", "", "", skipped.month, "", "", "", ""]);
    }
    return `${rows.map(row => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let closedQuote = false;
    const source = text.replace(/^\uFEFF/, "");

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += character;
        }
      } else if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
        throw new Error("CSV contains unexpected text after a quoted value.");
      } else if (character === '"' && field === "") {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
        closedQuote = false;
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(field);
        if (row.some(value => value !== "")) rows.push(row);
        row = [];
        field = "";
        closedQuote = false;
      } else {
        field += character;
      }
    }
    if (quoted) throw new Error("CSV contains an unclosed quoted value.");
    if (field !== "" || row.length > 0) {
      row.push(field);
      if (row.some(value => value !== "")) rows.push(row);
    }

    const legacyHeaders = ["record", "id", "description", "amount", "type", "category", "date", "month", "budget"];
    const headers = [...legacyHeaders, "recurring_id", "recurring_day", "start_month"];
    const legacyFormat = rows.length > 0 && rows[0].length === legacyHeaders.length &&
      legacyHeaders.every((header, index) => rows[0][index] === header);
    if (!legacyFormat && (!rows.length || rows[0].length !== headers.length ||
        headers.some((header, index) => rows[0][index] !== header))) {
      throw new Error("This is not a Daybook CSV. Use a CSV backup exported from Daybook.");
    }

    const expectedColumns = legacyFormat ? legacyHeaders.length : headers.length;
    const imported = { transactions: [], budgets: {}, recurringExpenses: [], recurringIncomes: [], recurringSkips: [] };
    const ids = new Set();
    const recurringIds = new Set();
    for (const values of rows.slice(1)) {
      if (values.length !== expectedColumns) throw new Error("CSV row has the wrong number of columns.");
      if (values[0] === "transaction") {
        const amount = Number(values[3]);
        const transactionDate = new Date(`${values[6]}T00:00:00Z`);
        if (!values[1] || ids.has(values[1]) || !values[2].trim() ||
            !Number.isFinite(amount) || amount <= 0 ||
            (values[4] !== "income" && values[4] !== "expense") ||
            !values[5] || !/^\d{4}-\d{2}-\d{2}$/.test(values[6]) ||
            !Number.isFinite(transactionDate.getTime()) || transactionDate.toISOString().slice(0, 10) !== values[6]) {
          throw new Error("CSV contains an invalid or duplicate transaction.");
        }
        ids.add(values[1]);
        const transaction = {
          id: values[1],
          description: values[2],
          amount,
          type: values[4],
          category: values[5],
          date: values[6]
        };
        if (!legacyFormat && values[9]) transaction.recurringId = values[9];
        imported.transactions.push(transaction);
      } else if (values[0] === "budget") {
        const amount = Number(values[8]);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values[7]) || !Number.isFinite(amount) || amount <= 0 ||
            Object.prototype.hasOwnProperty.call(imported.budgets, values[7])) {
          throw new Error("CSV contains an invalid or duplicate monthly budget.");
        }
        imported.budgets[values[7]] = amount;
      } else if (!legacyFormat && (values[0] === "recurring" || values[0] === "recurring_income")) {
        const amount = Number(values[3]);
        const day = Number(values[10]);
        const isIncome = values[0] === "recurring_income";
        if (!values[1] || recurringIds.has(values[1]) || !values[2].trim() ||
            !Number.isFinite(amount) || amount <= 0 || values[4] !== (isIncome ? "income" : "expense") ||
            !values[5] || !Number.isInteger(day) || day < 1 || day > 31 ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(values[11]) || values[7] !== values[11]) {
          throw new Error(`CSV contains an invalid or duplicate recurring ${isIncome ? "income" : "expense"}.`);
        }
        recurringIds.add(values[1]);
        (isIncome ? imported.recurringIncomes : imported.recurringExpenses).push({
          id: values[1],
          description: values[2],
          amount,
          category: values[5],
          day,
          startMonth: values[11]
        });
      } else if (!legacyFormat && values[0] === "skip") {
        if (!values[1] || !/^\d{4}-(0[1-9]|1[0-2])$/.test(values[7]) ||
            imported.recurringSkips.some(item => item.recurringId === values[1] && item.month === values[7])) {
          throw new Error("CSV contains an invalid or duplicate skipped occurrence.");
        }
        imported.recurringSkips.push({ recurringId: values[1], month: values[7] });
      } else {
        throw new Error("CSV contains an unknown record type.");
      }
    }
    return imported;
  }

  function handleDatabaseRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(HANDLE_DATABASE_NAME, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore(HANDLE_STORE_NAME);
      opening.onerror = () => reject(opening.error || new Error("Could not open CSV storage."));
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction(HANDLE_STORE_NAME, mode);
        let result;
        let request;
        try {
          request = operation(transaction.objectStore(HANDLE_STORE_NAME));
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        if (request) {
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => reject(request.error || new Error("Could not access CSV storage."));
        }
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error("Could not update CSV storage."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error || new Error("CSV storage was interrupted."));
        };
      };
    });
  }

  async function readCsvHandle(handle) {
    const text = await (await handle.getFile()).text();
    return text.trim() === "" ? {
      transactions: [], budgets: {}, recurringExpenses: [], recurringIncomes: [], recurringSkips: []
    } : parseCsv(text);
  }

  async function chooseCsvFile() {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: "Daybook CSV backup", accept: { "text/csv": [".csv"] } }]
    });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Permission to use the CSV was not granted.");
    return { handle, state: await readCsvHandle(handle) };
  }

  async function activateCsv(handle) {
    await handleDatabaseRequest("readwrite", store => store.put(handle, HANDLE_KEY));
    csvHandle = handle;
  }

  async function restoreCsvConnection(currentState) {
    if (typeof window.showOpenFilePicker !== "function" || !("indexedDB" in window)) {
      return { supported: false };
    }
    const handle = await handleDatabaseRequest("readonly", store => store.get(HANDLE_KEY));
    if (!handle) return { supported: true, connected: false };

    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      csvHandle = handle;
      return { supported: true, connected: false, remembered: true, handle };
    }

    const state = await readCsvHandle(handle);
    if (!state.transactions.length && !Object.keys(state.budgets).length &&
        !state.recurringExpenses.length && !state.recurringIncomes.length &&
        (currentState.transactions.length || Object.keys(currentState.budgets).length ||
          currentState.recurringExpenses.length || currentState.recurringIncomes.length)) {
      csvHandle = handle;
      return { supported: true, connected: false, empty: true, handle };
    }

    csvHandle = handle;
    return { supported: true, connected: true, handle, state };
  }

  async function reconnectCsv() {
    if (!csvHandle) throw new Error("No CSV file is connected.");
    const permission = await csvHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Permission to use the CSV was not granted.");
    return { handle: csvHandle, state: await readCsvHandle(csvHandle) };
  }

  async function disconnectCsv() {
    await handleDatabaseRequest("readwrite", store => store.delete(HANDLE_KEY));
    csvHandle = null;
  }

  async function saveState(state) {
    if (csvHandle) {
      let writable;
      try {
        writable = await csvHandle.createWritable();
        await writable.write(serializeState(state));
        await writable.close();
      } catch (error) {
        if (writable && typeof writable.abort === "function") {
          try {
            await writable.abort();
          } catch (abortError) {
            console.error("Could not close the CSV write.", abortError);
          }
        }
        console.error("Could not save the linked CSV.", error);
        return { saved: false, reason: "csv", fileName: csvHandle.name };
      }
    }

    if (!saveLocalCopy(state)) {
      if (csvHandle) return { saved: true, localCopySaved: false, fileName: csvHandle.name };
      return { saved: false, reason: "local" };
    }
    return { saved: true, fileName: csvHandle && csvHandle.name };
  }

  function downloadCsv(state, date) {
    const blob = new Blob([serializeState(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daybook-backup-${date}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.DaybookStorage = {
    loadState,
    saveLocalCopy,
    saveState,
    parseCsv,
    serializeState,
    chooseCsvFile,
    activateCsv,
    restoreCsvConnection,
    reconnectCsv,
    disconnectCsv,
    downloadCsv
  };
})();
