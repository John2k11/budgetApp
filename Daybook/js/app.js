(() => {
  const storage = window.DaybookStorage;
  const icons = {
    Food: "🥑", Transport: "🚲", Housing: "🏠", Utilities: "💡",
    Health: "🌿", Shopping: "🛍️", Entertainment: "🎟️", Salary: "💼", Other: "✦"
  };
  const monthPicker = document.getElementById("month-picker");
  const dateInput = document.getElementById("date");
  const form = document.getElementById("transaction-form");
  const typeInput = document.getElementById("type");
  const descriptionInput = document.getElementById("description");
  const budgetForm = document.getElementById("budget-form");
  const list = document.getElementById("transaction-list");
  const recurringForm = document.getElementById("recurring-form");
  const recurringList = document.getElementById("recurring-list");
  const storageStatus = document.getElementById("storage-status");
  const connectCsvButton = document.getElementById("connect-csv");
  const reconnectCsvButton = document.getElementById("reconnect-csv");
  const disconnectCsvButton = document.getElementById("disconnect-csv");
  const importCsvInput = document.getElementById("import-csv");
  const recurringDeleteDialog = document.getElementById("recurring-delete-dialog");
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
  const today = new Date();
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");

  let state = storage.loadState(showToast);
  let toastTimer;
  monthPicker.value = localDate.slice(0, 7);
  dateInput.value = localDate;

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function updateTransactionForm() {
    const type = typeInput.value;
    const label = type === "income" ? "income" : "expense";
    document.getElementById("transaction-heading").textContent = `Add ${label}`;
    document.getElementById("transaction-submit").textContent = `Add ${label}`;
    descriptionInput.placeholder = type === "income" ? "e.g. Monthly salary" : "e.g. Weekly groceries";
  }

  function renderTransactions(transactions) {
    list.replaceChildren();
    if (transactions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No transactions this month yet. Add one to get started.";
      list.append(empty);
      return;
    }

    for (const item of transactions) {
      const row = document.createElement("div");
      row.className = "transaction";
      const icon = document.createElement("span");
      icon.className = "category-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = icons[item.category] || icons.Other;

      const info = document.createElement("div");
      info.className = "transaction-info";
      const description = document.createElement("div");
      description.className = "transaction-name";
      description.textContent = item.description;
      const meta = document.createElement("div");
      meta.className = "transaction-meta";
      const dateLabel = new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      meta.textContent = `${item.category} · ${dateLabel}${item.recurringId ? " · Monthly" : ""}`;
      info.append(description, meta);

      const amount = document.createElement("span");
      amount.className = `transaction-amount ${item.type}`;
      amount.textContent = `${item.type === "income" ? "+" : "−"}${formatter.format(item.amount)}`;
      const remove = document.createElement("button");
      remove.className = "delete-button";
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${item.description}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => deleteTransaction(item));
      row.append(icon, info, amount, remove);
      list.append(row);
    }
  }

  function renderBudget(expenses, budget) {
    const percentage = budget > 0 ? Math.min((expenses / budget) * 100, 100) : 0;
    document.getElementById("budget-label").textContent = budget > 0 ? formatter.format(budget) : "Not set";
    document.getElementById("budget-amount").value = budget > 0 ? budget : "";
    document.getElementById("budget-progress").style.width = `${percentage}%`;
    document.getElementById("budget-progress").classList.toggle("over", budget > 0 && expenses > budget);
    document.querySelector(".progress").setAttribute("aria-valuenow", String(Math.round(percentage)));
    document.getElementById("budget-caption").textContent = budget > 0
      ? expenses > budget
        ? `${formatter.format(expenses - budget)} over budget`
        : `${formatter.format(budget - expenses)} left · ${Math.round(percentage)}% used`
      : "Set a budget to track your spending.";
  }

  function renderRecurringExpenses() {
    recurringList.replaceChildren();
    if (state.recurringExpenses.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No monthly outgoings set up yet.";
      recurringList.append(empty);
      return;
    }

    for (const recurring of state.recurringExpenses) {
      const row = document.createElement("div");
      row.className = "recurring-item";
      const info = document.createElement("div");
      info.className = "recurring-item-info";
      const name = document.createElement("div");
      name.className = "recurring-item-name";
      name.textContent = recurring.description;
      const meta = document.createElement("div");
      meta.className = "recurring-item-meta";
      meta.textContent = `${recurring.category} · Day ${recurring.day} · From ${recurring.startMonth}`;
      info.append(name, meta);

      const amount = document.createElement("span");
      amount.className = "recurring-item-amount";
      amount.textContent = `−${formatter.format(recurring.amount)}`;
      const stop = document.createElement("button");
      stop.className = "delete-button";
      stop.type = "button";
      stop.setAttribute("aria-label", `Stop recurring ${recurring.description}`);
      stop.textContent = "×";
      stop.addEventListener("click", () => stopRecurringExpense(recurring));
      row.append(info, amount, stop);
      recurringList.append(row);
    }
  }

  function render() {
    const month = monthPicker.value;
    const transactions = state.transactions
      .filter(item => item.date.slice(0, 7) === month)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const income = transactions.reduce((sum, item) => sum + (item.type === "income" ? item.amount : 0), 0);
    const expenses = transactions.reduce((sum, item) => sum + (item.type === "expense" ? item.amount : 0), 0);
    const balance = income - expenses;
    const budget = Number(state.budgets[month]) || 0;

    document.getElementById("income-total").textContent = formatter.format(income);
    document.getElementById("expense-total").textContent = formatter.format(expenses);
    document.getElementById("balance-total").textContent = formatter.format(balance);
    document.getElementById("balance-total").classList.toggle("income", balance >= 0);
    document.getElementById("balance-total").classList.toggle("expense", balance < 0);
    document.getElementById("transaction-count").textContent =
      `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
    renderTransactions(transactions);
    renderBudget(expenses, budget);
    renderRecurringExpenses();
  }

  async function saveCurrentState() {
    const result = await storage.saveState(state);
    if (!result.saved) {
      if (result.reason === "csv") {
        storageStatus.textContent = `Couldn't save to ${result.fileName}. Your change was not saved. Check file access and try again.`;
        showToast("Couldn't save to the linked CSV.");
      } else {
        showToast("Couldn't save. Check your browser storage.");
      }
      return false;
    }
    if (result.localCopySaved === false) {
      storageStatus.textContent = `Saved to ${result.fileName}; the browser's local copy could not be updated.`;
      showToast("Saved to CSV; browser copy could not be updated.");
    }
    return true;
  }

  function chooseRecurringDeleteAction(transaction) {
    document.getElementById("recurring-delete-description").textContent =
      `“${transaction.description}” is part of a monthly outgoing. Choose whether to keep it for future months.`;
    return new Promise(resolve => {
      recurringDeleteDialog.addEventListener("close", () => resolve(recurringDeleteDialog.returnValue), { once: true });
      recurringDeleteDialog.showModal();
    });
  }

  async function deleteTransaction(transaction) {
    const deleteAction = transaction.recurringId
      ? await chooseRecurringDeleteAction(transaction)
      : "occurrence";
    if (deleteAction === "cancel" || !deleteAction) return;
    const previousTransactions = state.transactions;
    const previousSkips = state.recurringSkips;
    const previousRecurringExpenses = state.recurringExpenses;
    state.transactions = state.transactions.filter(item => item.id !== transaction.id);
    if (transaction.recurringId && deleteAction === "occurrence") {
      const month = transaction.date.slice(0, 7);
      const alreadySkipped = state.recurringSkips.some(item =>
        item.recurringId === transaction.recurringId && item.month === month);
      if (!alreadySkipped) state.recurringSkips = [...state.recurringSkips, { recurringId: transaction.recurringId, month }];
    } else if (transaction.recurringId && deleteAction === "future") {
      state.recurringExpenses = state.recurringExpenses.filter(item => item.id !== transaction.recurringId);
      state.recurringSkips = state.recurringSkips.filter(item => item.recurringId !== transaction.recurringId);
    }
    if (await saveCurrentState()) render();
    else {
      state.transactions = previousTransactions;
      state.recurringSkips = previousSkips;
      state.recurringExpenses = previousRecurringExpenses;
    }
  }

  function createId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function occurrenceDate(month, day) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  }

  async function ensureRecurringExpenses(month) {
    const toAdd = state.recurringExpenses.filter(recurring =>
      recurring.startMonth <= month &&
      !state.recurringSkips.some(item => item.recurringId === recurring.id && item.month === month) &&
      !state.transactions.some(item => item.recurringId === recurring.id && item.date.slice(0, 7) === month)
    );
    if (toAdd.length === 0) return true;

    const previousTransactions = state.transactions;
    state.transactions = [
      ...state.transactions,
      ...toAdd.map(recurring => ({
        id: createId(),
        description: recurring.description,
        amount: recurring.amount,
        type: "expense",
        category: recurring.category,
        date: occurrenceDate(month, recurring.day),
        recurringId: recurring.id
      }))
    ];
    if (await saveCurrentState()) return true;
    state.transactions = previousTransactions;
    return false;
  }

  async function addRecurringExpense(event) {
    event.preventDefault();
    if (!recurringForm.reportValidity()) return;
    const data = new FormData(recurringForm);
    const amount = Number(data.get("amount"));
    const day = Number(data.get("day"));
    const description = String(data.get("description")).trim();
    if (!description || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isInteger(day) || day < 1 || day > 31) return;

    const recurring = {
      id: createId(),
      description,
      amount: Math.round(amount * 100) / 100,
      category: String(data.get("category")),
      day,
      startMonth: monthPicker.value
    };
    state.recurringExpenses.push(recurring);
    if (!(await ensureRecurringExpenses(monthPicker.value))) {
      state.recurringExpenses = state.recurringExpenses.filter(item => item.id !== recurring.id);
      return;
    }
    recurringForm.reset();
    document.getElementById("recurring-day").value = "1";
    render();
    showToast("Monthly outgoing added.");
  }

  async function stopRecurringExpense(recurring) {
    if (!window.confirm(`Stop adding “${recurring.description}” in future months? Existing expenses will remain.`)) return;
    const previousRecurringExpenses = state.recurringExpenses;
    const previousRecurringSkips = state.recurringSkips;
    state.recurringExpenses = state.recurringExpenses.filter(item => item.id !== recurring.id);
    state.recurringSkips = state.recurringSkips.filter(item => item.recurringId !== recurring.id);
    if (await saveCurrentState()) {
      render();
      showToast("Future monthly outgoings stopped.");
    } else {
      state.recurringExpenses = previousRecurringExpenses;
      state.recurringSkips = previousRecurringSkips;
    }
  }

  async function addTransaction(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const transaction = {
      id: createId(),
      description: String(data.get("description")).trim(),
      amount: Math.round(amount * 100) / 100,
      type: String(data.get("type")),
      category: String(data.get("category")),
      date: String(data.get("date"))
    };
    if (!transaction.description || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) return;
    state.transactions.push(transaction);
    if (!(await saveCurrentState())) {
      state.transactions.pop();
      return;
    }
    form.reset();
    updateTransactionForm();
    dateInput.value = localDate;
    monthPicker.value = transaction.date.slice(0, 7);
    render();
    showToast("Transaction added.");
  }

  function addIncome() {
    typeInput.value = "income";
    updateTransactionForm();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    descriptionInput.focus({ preventScroll: true });
  }

  function confirmDataReplacement(imported) {
    const hasCurrentData = state.transactions.length || Object.keys(state.budgets).length ||
      state.recurringExpenses.length;
    if (!hasCurrentData) return true;
    const transactionCount = imported.transactions.length;
    const budgetCount = Object.keys(imported.budgets).length;
    const recurringCount = imported.recurringExpenses.length;
    return window.confirm(
      `Replace your current data with this CSV? It contains ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}, ${budgetCount} monthly budget${budgetCount === 1 ? "" : "s"}, and ${recurringCount} recurring outgoing${recurringCount === 1 ? "" : "s"}.`
    );
  }

  function updateCsvConnectionStatus(message, connected = false) {
    storageStatus.textContent = message;
    connectCsvButton.textContent = connected ? "Change live CSV" : "Connect live CSV";
    reconnectCsvButton.hidden = !connected;
    disconnectCsvButton.hidden = !connected;
  }

  async function connectCsv() {
    try {
      const candidate = await storage.chooseCsvFile();
      if (!confirmDataReplacement(candidate.state)) return;
      await storage.activateCsv(candidate.handle);
      state = candidate.state;
      storage.saveLocalCopy(state);
      render();
      updateCsvConnectionStatus(`Live CSV connected: ${candidate.handle.name}. Changes are saved to this file.`, true);
      showToast("CSV connected.");
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Could not connect the CSV file.", error);
      storageStatus.textContent = "Could not connect this CSV. Check that it is a valid Daybook CSV and try again.";
      showToast(error.message || "Couldn't connect the CSV file.");
    }
  }

  async function reconnectCsv() {
    try {
      const candidate = await storage.reconnectCsv();
      if (!confirmDataReplacement(candidate.state)) return;
      state = candidate.state;
      storage.saveLocalCopy(state);
      render();
      updateCsvConnectionStatus(`Live CSV connected: ${candidate.handle.name}. Changes are saved to this file.`, true);
      showToast("CSV reconnected.");
    } catch (error) {
      console.error("Could not reconnect the CSV file.", error);
      storageStatus.textContent = "Could not read the linked CSV. Your browser copy is unchanged.";
      showToast(error.message || "Couldn't reconnect the CSV file.");
    }
  }

  async function restoreCsvConnection() {
    try {
      const result = await storage.restoreCsvConnection(state);
      if (!result.supported) {
        connectCsvButton.hidden = true;
        storageStatus.textContent = "Live CSV storage is not supported in this browser. You can still download and import CSV backups.";
      } else if (result.remembered) {
        updateCsvConnectionStatus(`CSV file remembered: ${result.handle.name}. Reconnect to load and save its data.`, true);
      } else if (result.empty) {
        updateCsvConnectionStatus(`The linked CSV (${result.handle.name}) is empty. Your browser copy was kept; reconnect to confirm before replacing it.`, true);
      } else if (result.connected) {
        state = result.state;
        storage.saveLocalCopy(state);
        render();
        updateCsvConnectionStatus(`Live CSV connected: ${result.handle.name}. Changes are saved to this file.`, true);
      }
    } catch (error) {
      console.error("Could not restore the linked CSV.", error);
      storageStatus.textContent = "Could not check the saved CSV connection. CSV backups are still available.";
    }
  }

  async function openMonth() {
    await ensureRecurringExpenses(monthPicker.value);
    render();
  }

  async function initialize() {
    await restoreCsvConnection();
    await ensureRecurringExpenses(monthPicker.value);
    render();
  }

  async function disconnectCsv() {
    try {
      await storage.disconnectCsv();
      updateCsvConnectionStatus("CSV disconnected. Your data remains saved in this browser.");
      showToast("CSV disconnected.");
    } catch (error) {
      console.error("Could not disconnect the CSV file.", error);
      showToast("Couldn't disconnect the CSV file.");
    }
  }

  async function importCsv() {
    const file = importCsvInput.files[0];
    if (!file) return;
    try {
      const imported = storage.parseCsv(await file.text());
      if (!confirmDataReplacement(imported)) return;
      const previous = state;
      state = imported;
      if (!(await saveCurrentState())) {
        state = previous;
        return;
      }
      render();
      showToast("CSV backup restored.");
    } catch (error) {
      console.error("Could not import the CSV backup.", error);
      showToast(error.message || "Couldn't import the CSV backup.");
    } finally {
      importCsvInput.value = "";
    }
  }

  async function saveBudget(event) {
    event.preventDefault();
    const input = document.getElementById("budget-amount");
    if (!input.reportValidity()) return;
    const value = input.value === "" ? 0 : Number(input.value);
    if (!Number.isFinite(value) || value < 0) return;
    const month = monthPicker.value;
    const previous = state.budgets[month];
    if (value === 0) delete state.budgets[month];
    else state.budgets[month] = Math.round(value * 100) / 100;
    if (!(await saveCurrentState())) {
      if (previous === undefined) delete state.budgets[month];
      else state.budgets[month] = previous;
      render();
      return;
    }
    render();
    showToast(value === 0 ? "Budget removed." : "Budget saved.");
  }

  form.addEventListener("submit", addTransaction);
  recurringForm.addEventListener("submit", addRecurringExpense);
  document.getElementById("add-income").addEventListener("click", addIncome);
  typeInput.addEventListener("change", updateTransactionForm);
  document.getElementById("download-csv").addEventListener("click", () => {
    storage.downloadCsv(state, localDate);
    showToast("CSV backup downloaded.");
  });
  document.getElementById("import-csv-button").addEventListener("click", () => importCsvInput.click());
  importCsvInput.addEventListener("change", importCsv);
  connectCsvButton.addEventListener("click", connectCsv);
  reconnectCsvButton.addEventListener("click", reconnectCsv);
  disconnectCsvButton.addEventListener("click", disconnectCsv);
  budgetForm.addEventListener("submit", saveBudget);
  monthPicker.addEventListener("change", openMonth);

  updateTransactionForm();
  render();
  initialize();
})();
