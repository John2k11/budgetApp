(() => {
  const storage = window.DaybookStorage;
  const icons = {
    Food: "🥑", Transport: "🚲", Housing: "🏠", Utilities: "💡", Savings: "🏦",
    Health: "🌿", Shopping: "🛍️", Entertainment: "🎟️", Salary: "💼", Other: "✦"
  };
  const monthPicker = document.getElementById("month-picker");
  const paydayInput = document.getElementById("payday-day");
  const themeToggle = document.getElementById("theme-toggle");
  const themeToggleLabel = document.getElementById("theme-toggle-label");
  const palettePicker = document.getElementById("palette-picker");
  const dateInput = document.getElementById("date");
  const form = document.getElementById("transaction-form");
  const typeInput = document.getElementById("type");
  const descriptionInput = document.getElementById("description");
  const budgetForm = document.getElementById("budget-form");
  const list = document.getElementById("transaction-list");
  const trendChart = document.getElementById("trend-chart");
  const chartTooltip = document.getElementById("chart-tooltip");
  const chartNote = document.getElementById("chart-note");
  const transactionPagination = document.getElementById("transaction-pagination");
  const previousTransactionsButton = document.getElementById("previous-transactions");
  const nextTransactionsButton = document.getElementById("next-transactions");
  const transactionPageStatus = document.getElementById("transaction-page-status");
  const mobileTransactionStatus = document.getElementById("mobile-transaction-status");
  const loadMoreTransactionsButton = document.getElementById("load-more-transactions");
  const mobileViewport = window.matchMedia("(max-width: 720px)");
  const transactionsPerPage = 10;
  const recurringForm = document.getElementById("recurring-form");
  const recurringIncomeForm = document.getElementById("recurring-income-form");
  const recurringList = document.getElementById("recurring-list");
  const recurringIncomeList = document.getElementById("recurring-income-list");
  const recurringPagination = document.getElementById("recurring-pagination");
  const previousRecurringButton = document.getElementById("previous-recurring");
  const nextRecurringButton = document.getElementById("next-recurring");
  const recurringPageStatus = document.getElementById("recurring-page-status");
  const mobileRecurringStatus = document.getElementById("mobile-recurring-status");
  const loadMoreRecurringButton = document.getElementById("load-more-recurring");
  const recurringEditDialog = document.getElementById("recurring-edit-dialog");
  const recurringEditForm = document.getElementById("recurring-edit-form");
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
  let transactionPage = 0;
  let mobileVisibleCount = transactionsPerPage;
  let recurringExpensePage = 0;
  let mobileRecurringVisibleCount = transactionsPerPage;
  const pendingForms = new WeakSet();
  let recurringTransactionQueue = Promise.resolve();
  paydayInput.value = String(state.paydayDay);
  monthPicker.value = cycleMonthForDate(localDate);
  dateInput.value = localDate;

  function applyTheme(theme, palette) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.dataset.palette = palette;
    palettePicker.value = palette;
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "night"} mode`);
    themeToggleLabel.textContent = isDark ? "Light mode" : "Night mode";
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
  }

  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme, document.documentElement.dataset.palette);
    try {
      localStorage.setItem("daybook-theme", theme);
    } catch (error) {
      console.error("Could not save the theme preference.", error);
      showToast("Theme changed, but the preference couldn't be saved.");
    }
  }

  function changePalette() {
    const palette = palettePicker.value;
    applyTheme(document.documentElement.dataset.theme, palette);
    try {
      localStorage.setItem("budgetgo-palette", palette);
    } catch (error) {
      console.error("Could not save the color theme preference.", error);
      showToast("Color theme changed, but the preference couldn't be saved.");
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function preservePaydayWhenCsvHasNoSetting(csvState) {
    if (csvState.hasPaydaySetting === false) csvState.paydayDay = state.paydayDay;
    delete csvState.hasPaydaySetting;
    return csvState;
  }

  function addMonths(month, amount) {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(year, monthNumber - 1 + amount, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function shiftDate(date, amount) {
    const [year, month, day] = date.split("-").map(Number);
    const shifted = new Date(year, month - 1, day + amount);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
  }

  function cycleBounds(month) {
    const startMonth = addMonths(month, -1);
    return {
      startDate: occurrenceDate(startMonth, state.paydayDay),
      endDate: shiftDate(occurrenceDate(month, state.paydayDay), -1)
    };
  }

  function cycleMonthForDate(date) {
    const month = date.slice(0, 7);
    return date < occurrenceDate(month, state.paydayDay) ? month : addMonths(month, 1);
  }

  function formatDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  function renderWeeklySpendingSuggestion(balance, startDate, endDate) {
    const suggestion = document.getElementById("weekly-spending-suggestion");
    const note = document.getElementById("weekly-guidance-note");
    suggestion.classList.remove("expense");
    const remainingStartDate = localDate < startDate ? startDate : localDate;
    if (endDate < remainingStartDate) {
      suggestion.textContent = "—";
      note.textContent = "This budget cycle has ended.";
      return;
    }

    const firstDay = new Date(`${remainingStartDate}T00:00:00Z`);
    const lastDay = new Date(`${endDate}T00:00:00Z`);
    const remainingDays = Math.floor((lastDay - firstDay) / 86400000) + 1;
    const remainingWeeks = Math.ceil(remainingDays / 7);
    if (balance < 0) {
      suggestion.textContent = formatter.format(balance);
      suggestion.classList.add("expense");
      note.textContent = `You are over your available balance. There is no suggested spending allowance for this cycle.`;
      return;
    }
    suggestion.classList.remove("expense");
    if (balance === 0) {
      suggestion.textContent = formatter.format(0);
      note.textContent = `No money is left to spend across the ${remainingWeeks} week${remainingWeeks === 1 ? "" : "s"} remaining in this cycle.`;
      return;
    }

    const weeklyAmount = Math.floor((balance / remainingWeeks) * 100) / 100;
    suggestion.textContent = formatter.format(weeklyAmount);
    note.textContent = `Per week for the ${remainingWeeks} week${remainingWeeks === 1 ? "" : "s"} remaining in this cycle, based on your left-to-spend balance.`;
  }

  function syncCycleControls() {
    paydayInput.value = String(state.paydayDay);
    monthPicker.value = cycleMonthForDate(localDate);
  }

  function updateTransactionForm() {
    const type = typeInput.value;
    const label = type === "income" ? "income" : type === "savings" ? "savings" : "expense";
    document.getElementById("transaction-heading").textContent = `Add ${label}`;
    document.getElementById("transaction-submit").textContent = `Add ${label}`;
    descriptionInput.placeholder = type === "income"
      ? "e.g. Monthly salary"
      : type === "savings" ? "e.g. Emergency fund" : "e.g. Weekly groceries";
    if (type === "savings") document.getElementById("category").value = "Savings";
  }

  function resetTransactionView() {
    transactionPage = 0;
    mobileVisibleCount = transactionsPerPage;
  }

  function renderTransactions(transactions) {
    list.replaceChildren();
    loadMoreTransactionsButton.hidden = true;
    if (transactions.length === 0) {
      transactionPagination.hidden = true;
      mobileTransactionStatus.textContent = "";
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No transactions in this budget cycle yet. Add one to get started.";
      list.append(empty);
      return;
    }

    const pageCount = Math.ceil(transactions.length / transactionsPerPage);
    transactionPage = Math.min(transactionPage, pageCount - 1);
    const isMobile = mobileViewport.matches;
    const pageStart = isMobile ? 0 : transactionPage * transactionsPerPage;
    const pageTransactions = isMobile
      ? transactions.slice(0, mobileVisibleCount)
      : transactions.slice(pageStart, pageStart + transactionsPerPage);
    transactionPagination.hidden = isMobile || pageCount <= 1;
    previousTransactionsButton.disabled = transactionPage === 0;
    nextTransactionsButton.disabled = transactionPage >= pageCount - 1;
    transactionPageStatus.textContent =
      `Showing ${pageStart + 1}–${pageStart + pageTransactions.length} of ${transactions.length}`;
    mobileTransactionStatus.textContent = isMobile
      ? `Showing ${pageTransactions.length} of ${transactions.length} transactions`
      : "";

    for (const item of pageTransactions) {
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
      amount.className = `transaction-amount ${item.type === "income" ? "income" : "expense"}`;
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

    loadMoreTransactionsButton.hidden = !isMobile || pageTransactions.length >= transactions.length;
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

  function renderTrendChart(transactions, startDate, endDate, budget) {
    const namespace = "http://www.w3.org/2000/svg";
    const isMobile = mobileViewport.matches;
    const width = isMobile ? Math.max(Math.round(trendChart.clientWidth), 320) : 800;
    const height = 320;
    const padding = { top: 20, right: isMobile ? 14 : 24, bottom: 46, left: isMobile ? 64 : 82 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const dayCount = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
    ) + 1;
    const dailyIncome = new Map();
    const dailyExpenses = new Map();
    for (const transaction of transactions) {
      const dailySeries = transaction.type === "income" ? dailyIncome : dailyExpenses;
      dailySeries.set(transaction.date, (dailySeries.get(transaction.date) || 0) + transaction.amount);
    }

    let incomeTotal = 0;
    let expenseTotal = 0;
    const points = [];
    for (let day = 0; day < dayCount; day += 1) {
      const date = shiftDate(startDate, day);
      incomeTotal += dailyIncome.get(date) || 0;
      expenseTotal += dailyExpenses.get(date) || 0;
      points.push({ income: incomeTotal, expenses: expenseTotal });
    }

    const maxValue = Math.max(budget, incomeTotal, expenseTotal, 100);
    const tickStep = maxValue / 4;
    const y = value => padding.top + plotHeight * (1 - value / maxValue);
    const x = day => padding.left + (dayCount <= 1 ? 0 : (day / (dayCount - 1)) * plotWidth);
    const svgElement = (name, attributes, text) => {
      const element = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
      if (text !== undefined) element.textContent = text;
      return element;
    };

    trendChart.replaceChildren();
    trendChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    trendChart.setAttribute(
      "aria-label",
      `Cumulative cycle expenses ${formatter.format(expenseTotal)}, cumulative cycle income ${formatter.format(incomeTotal)}, and ${budget > 0 ? `budget ${formatter.format(budget)}` : "budget not set"} from ${formatDate(startDate)} through ${formatDate(endDate)}`
    );
    chartTooltip.hidden = true;
    trendChart.onpointermove = event => {
      const bounds = trendChart.getBoundingClientRect();
      const chartX = ((event.clientX - bounds.left) / bounds.width) * width;
      const chartY = ((event.clientY - bounds.top) / bounds.height) * height;
      if (chartX < padding.left || chartX > width - padding.right ||
          chartY < padding.top || chartY > height - padding.bottom) {
        chartTooltip.hidden = true;
        return;
      }

      const day = Math.max(0, Math.min(dayCount - 1,
        Math.round(((chartX - padding.left) / plotWidth) * (dayCount - 1))));
      const date = shiftDate(startDate, day);
      chartTooltip.replaceChildren();
      const dateLabel = document.createElement("div");
      dateLabel.className = "chart-tooltip-date";
      dateLabel.textContent = formatDate(date);
      chartTooltip.append(dateLabel);
      const values = [
        { label: "Budget", value: budget > 0 ? formatter.format(budget) : "Not set", color: "budget" },
        { label: "Expenses", value: formatter.format(points[day].expenses), color: "expense" },
        { label: "Income", value: formatter.format(points[day].income), color: "income" }
      ];
      for (const item of values) {
        const row = document.createElement("div");
        row.className = "chart-tooltip-row";
        const dot = document.createElement("span");
        dot.className = `chart-tooltip-dot chart-tooltip-${item.color}`;
        dot.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = `${item.label}: ${item.value}`;
        row.append(dot, text);
        chartTooltip.append(row);
      }

      const wrapperBounds = chartTooltip.parentElement.getBoundingClientRect();
      const pointerX = event.clientX - wrapperBounds.left;
      const pointerY = event.clientY - wrapperBounds.top;
      chartTooltip.hidden = false;
      const tooltipWidth = chartTooltip.offsetWidth;
      const tooltipHeight = chartTooltip.offsetHeight;
      chartTooltip.style.left = `${Math.max(0, Math.min(pointerX + 12, wrapperBounds.width - tooltipWidth))}px`;
      chartTooltip.style.top = `${Math.max(0, Math.min(pointerY - tooltipHeight - 8, wrapperBounds.height - tooltipHeight))}px`;
    };
    trendChart.onpointerdown = trendChart.onpointermove;
    trendChart.onpointerleave = event => {
      if (event.pointerType !== "touch") chartTooltip.hidden = true;
    };
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = tickStep * tick;
      const position = y(value);
      trendChart.append(
        svgElement("line", {
          x1: padding.left, y1: position, x2: width - padding.right, y2: position, class: "chart-grid"
        }),
        svgElement("text", {
          x: padding.left - 10, y: position + 4, "text-anchor": "end", class: "chart-axis-label"
        }, formatter.format(value))
      );
    }

    const labelCount = Math.min(5, dayCount);
    for (let label = 0; label < labelCount; label += 1) {
      const day = Math.round(label * (dayCount - 1) / Math.max(labelCount - 1, 1));
      const date = shiftDate(startDate, day);
      const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      trendChart.append(svgElement("text", {
        x: x(day), y: height - 12, "text-anchor": label === 0 ? "start" : label === labelCount - 1 ? "end" : "middle",
        class: "chart-axis-label"
      }, dateLabel));
    }

    const makeStepPath = key => {
      if (points.length === 0) return "";
      let path = `M${x(0).toFixed(2)},${y(points[0][key]).toFixed(2)}`;
      for (let index = 1; index < points.length; index += 1) {
        path += ` L${x(index).toFixed(2)},${y(points[index - 1][key]).toFixed(2)}`;
        path += ` L${x(index).toFixed(2)},${y(points[index][key]).toFixed(2)}`;
      }
      return path;
    };
    if (budget > 0) {
      trendChart.append(svgElement("path", {
        d: `M${padding.left},${y(budget).toFixed(2)} L${width - padding.right},${y(budget).toFixed(2)}`,
        class: "chart-line chart-line-budget"
      }));
    }
    if (expenseTotal > 0) {
      trendChart.append(svgElement("path", { d: makeStepPath("expenses"), class: "chart-line chart-line-expense" }));
    }
    if (incomeTotal > 0) {
      trendChart.append(svgElement("path", { d: makeStepPath("income"), class: "chart-line chart-line-income" }));
    }
    chartNote.textContent = budget > 0
      ? ""
      : "Set this cycle’s budget to show its target line.";
  }

  function renderRecurringItems(container, items, emptyMessage, type, paginate = false) {
    container.replaceChildren();
    const isMobile = paginate && mobileViewport.matches;
    const pageCount = Math.ceil(items.length / transactionsPerPage);
    if (paginate) {
      recurringExpensePage = Math.min(recurringExpensePage, Math.max(0, pageCount - 1));
      recurringPagination.hidden = isMobile || pageCount <= 1;
      previousRecurringButton.disabled = recurringExpensePage === 0;
      nextRecurringButton.disabled = recurringExpensePage >= pageCount - 1;
      recurringPageStatus.textContent = items.length === 0
        ? "Showing 0 of 0"
        : `Showing ${recurringExpensePage * transactionsPerPage + 1}–${Math.min(
          (recurringExpensePage + 1) * transactionsPerPage, items.length
        )} of ${items.length}`;
      mobileRecurringStatus.textContent = isMobile
        ? `Showing ${Math.min(mobileRecurringVisibleCount, items.length)} of ${items.length} monthly outgoings`
        : "";
      loadMoreRecurringButton.hidden = !isMobile || mobileRecurringVisibleCount >= items.length;
    }
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }

    const visibleItems = !paginate
      ? items
      : isMobile
        ? items.slice(0, mobileRecurringVisibleCount)
        : items.slice(recurringExpensePage * transactionsPerPage, (recurringExpensePage + 1) * transactionsPerPage);
    for (const recurring of visibleItems) {
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
      amount.textContent = `${type === "income" ? "+" : "−"}${formatter.format(recurring.amount)}`;
      if (type === "expense") {
        const edit = document.createElement("button");
        edit.className = "secondary recurring-edit-button";
        edit.type = "button";
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", `Edit monthly outgoing ${recurring.description}`);
        edit.addEventListener("click", () => openRecurringExpenseEditor(recurring));
        row.append(info, amount, edit);
      } else {
        row.append(info, amount);
      }
      const stop = document.createElement("button");
      stop.className = "delete-button";
      stop.type = "button";
      stop.setAttribute("aria-label", `Stop recurring ${recurring.description}`);
      stop.textContent = "×";
      stop.addEventListener("click", () => stopRecurring(recurring, type));
      row.append(stop);
      container.append(row);
    }
  }

  function renderRecurringLists() {
    renderRecurringItems(recurringList, state.recurringExpenses, "No monthly outgoings set up yet.", "expense", true);
    renderRecurringItems(recurringIncomeList, state.recurringIncomes, "No monthly income set up yet.", "income");
  }

  function render() {
    const month = monthPicker.value;
    const { startDate, endDate } = cycleBounds(month);
    const transactions = state.transactions
      .filter(item => item.date >= startDate && item.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const income = transactions.reduce((sum, item) => sum + (item.type === "income" ? item.amount : 0), 0);
    const expenses = transactions.reduce((sum, item) => sum + (item.type !== "income" ? item.amount : 0), 0);
    const balance = state.transactions
      .filter(item => item.date <= endDate)
      .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
    const budget = Number(state.budgets[month]) || 0;

    document.getElementById("income-total").textContent = formatter.format(income);
    document.getElementById("expense-total").textContent = formatter.format(expenses);
    document.getElementById("balance-total").textContent = formatter.format(balance);
    document.getElementById("balance-total").classList.toggle("income", balance >= 0);
    document.getElementById("balance-total").classList.toggle("expense", balance < 0);
    document.getElementById("cycle-range").textContent = `${formatDate(startDate)}–${formatDate(endDate)}`;
    renderWeeklySpendingSuggestion(balance, startDate, endDate);
    document.getElementById("transaction-count").textContent =
      `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
    renderTransactions(transactions);
    renderBudget(expenses, budget);
    renderTrendChart(transactions, startDate, endDate, budget);
    renderRecurringLists();
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

  async function handleFormSubmission(targetForm, event, handler) {
    event.preventDefault();
    if (pendingForms.has(targetForm)) return;
    pendingForms.add(targetForm);
    const submitButton = targetForm.querySelector('[type="submit"]');
    const wasDisabled = submitButton && submitButton.disabled;
    if (submitButton) submitButton.disabled = true;
    try {
      await handler(event);
    } finally {
      pendingForms.delete(targetForm);
      if (submitButton) submitButton.disabled = wasDisabled;
    }
  }

  function chooseRecurringDeleteAction(transaction) {
    document.getElementById("recurring-delete-description").textContent =
      `“${transaction.description}” is part of monthly ${transaction.type === "income" ? "income" : "outgoings"}. Choose whether to keep it for future months.`;
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
    const previousRecurringIncomes = state.recurringIncomes;
    state.transactions = state.transactions.filter(item => item.id !== transaction.id);
    if (transaction.recurringId && deleteAction === "occurrence") {
      const month = transaction.date.slice(0, 7);
      const alreadySkipped = state.recurringSkips.some(item =>
        item.recurringId === transaction.recurringId && item.month === month);
      if (!alreadySkipped) state.recurringSkips = [...state.recurringSkips, { recurringId: transaction.recurringId, month }];
    } else if (transaction.recurringId && deleteAction === "future") {
      state.recurringExpenses = state.recurringExpenses.filter(item => item.id !== transaction.recurringId);
      state.recurringIncomes = state.recurringIncomes.filter(item => item.id !== transaction.recurringId);
      state.recurringSkips = state.recurringSkips.filter(item => item.recurringId !== transaction.recurringId);
    }
    if (await saveCurrentState()) render();
    else {
      state.transactions = previousTransactions;
      state.recurringSkips = previousSkips;
      state.recurringExpenses = previousRecurringExpenses;
      state.recurringIncomes = previousRecurringIncomes;
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

  function ensureRecurringTransactions(endDate, saveWhenUnchanged = false) {
    const operation = recurringTransactionQueue.then(() =>
      addMissingRecurringTransactions(endDate, saveWhenUnchanged));
    recurringTransactionQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function addMissingRecurringTransactions(endDate, saveWhenUnchanged) {
    const recurringItems = [
      ...state.recurringExpenses.map(item => ({ ...item, type: "expense" })),
      ...state.recurringIncomes.map(item => ({ ...item, type: "income" }))
    ];
    const endMonth = endDate.slice(0, 7);
    const toAdd = [];
    for (const recurring of recurringItems) {
      for (let month = recurring.startMonth; month <= endMonth; month = addMonths(month, 1)) {
        const date = occurrenceDate(month, recurring.day);
        if (date < recurring.startDate || date > endDate ||
            state.recurringSkips.some(item => item.recurringId === recurring.id && item.month === month) ||
            state.transactions.some(item => item.recurringId === recurring.id && item.date.slice(0, 7) === month)) {
          continue;
        }
        toAdd.push({ recurring, date });
      }
    }
    if (toAdd.length === 0) return saveWhenUnchanged ? saveCurrentState() : true;

    const previousTransactions = state.transactions;
    state.transactions = [
      ...state.transactions,
      ...toAdd.map(({ recurring, date }) => ({
        id: createId(),
        description: recurring.description,
        amount: recurring.amount,
        type: recurring.type,
        category: recurring.category,
        date,
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

    const startDate = cycleBounds(monthPicker.value).startDate;
    const recurring = {
      id: createId(),
      description,
      amount: Math.round(amount * 100) / 100,
      category: String(data.get("category")),
      day,
      startMonth: startDate.slice(0, 7),
      startDate
    };
    state.recurringExpenses.push(recurring);
    if (!(await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate, true))) {
      state.recurringExpenses = state.recurringExpenses.filter(item => item.id !== recurring.id);
      return;
    }
    recurringForm.reset();
    document.getElementById("recurring-day").value = "1";
    render();
    showToast("Monthly outgoing added.");
  }

  async function addRecurringIncome(event) {
    event.preventDefault();
    if (!recurringIncomeForm.reportValidity()) return;
    const data = new FormData(recurringIncomeForm);
    const amount = Number(data.get("amount"));
    const day = Number(data.get("day"));
    const description = String(data.get("description")).trim();
    if (!description || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isInteger(day) || day < 1 || day > 31) return;

    const startDate = cycleBounds(monthPicker.value).startDate;
    const recurring = {
      id: createId(),
      description,
      amount: Math.round(amount * 100) / 100,
      category: String(data.get("category")),
      day,
      startMonth: startDate.slice(0, 7),
      startDate
    };
    state.recurringIncomes.push(recurring);
    if (!(await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate, true))) {
      state.recurringIncomes = state.recurringIncomes.filter(item => item.id !== recurring.id);
      return;
    }
    recurringIncomeForm.reset();
    document.getElementById("recurring-income-day").value = "1";
    render();
    showToast("Monthly income added.");
  }

  async function stopRecurring(recurring, type) {
    const collection = type === "income" ? state.recurringIncomes : state.recurringExpenses;
    const label = type === "income" ? "income" : "expenses";
    if (!window.confirm(`Stop adding “${recurring.description}” in future months? Existing ${label} will remain.`)) return;
    const previousRecurringExpenses = state.recurringExpenses;
    const previousRecurringIncomes = state.recurringIncomes;
    const previousRecurringSkips = state.recurringSkips;
    if (type === "income") {
      state.recurringIncomes = collection.filter(item => item.id !== recurring.id);
    } else {
      state.recurringExpenses = collection.filter(item => item.id !== recurring.id);
    }
    state.recurringSkips = state.recurringSkips.filter(item => item.recurringId !== recurring.id);
    if (await saveCurrentState()) {
      render();
      showToast(`Future monthly ${type === "income" ? "income" : "outgoings"} stopped.`);
    } else {
      state.recurringExpenses = previousRecurringExpenses;
      state.recurringIncomes = previousRecurringIncomes;
      state.recurringSkips = previousRecurringSkips;
    }
  }

  function openRecurringExpenseEditor(recurring) {
    document.getElementById("recurring-edit-description").value = recurring.description;
    document.getElementById("recurring-edit-amount").value = String(recurring.amount);
    const categoryPicker = document.getElementById("recurring-edit-category");
    categoryPicker.value = recurring.category;
    if (categoryPicker.value !== recurring.category) {
      const option = document.createElement("option");
      option.value = recurring.category;
      option.textContent = recurring.category;
      categoryPicker.append(option);
      categoryPicker.value = recurring.category;
    }
    document.getElementById("recurring-edit-day").value = String(recurring.day);
    document.getElementById("recurring-edit-start-date").value = recurring.startDate || `${recurring.startMonth}-01`;
    recurringEditForm.dataset.recurringId = recurring.id;
    recurringEditDialog.showModal();
  }

  async function saveRecurringExpenseEdits(event) {
    event.preventDefault();
    if (!recurringEditForm.reportValidity()) return;
    const data = new FormData(recurringEditForm);
    const amount = Number(data.get("amount"));
    const day = Number(data.get("day"));
    const description = String(data.get("description")).trim();
    const startDate = String(data.get("startDate"));
    const startDateValue = new Date(`${startDate}T00:00:00Z`);
    if (!description || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isInteger(day) || day < 1 || day > 31 ||
        !Number.isFinite(startDateValue.getTime()) || startDateValue.toISOString().slice(0, 10) !== startDate) {
      return;
    }
    const recurringId = recurringEditForm.dataset.recurringId;
    const previousExpenses = state.recurringExpenses;
    const updated = state.recurringExpenses.find(item => item.id === recurringId);
    if (!updated) {
      recurringEditDialog.close();
      showToast("This monthly outgoing could not be found.");
      return;
    }
    state.recurringExpenses = state.recurringExpenses.map(item => item.id === recurringId
      ? {
        ...item,
        description,
        amount: Math.round(amount * 100) / 100,
        category: String(data.get("category")),
        day,
        startDate,
        startMonth: startDate.slice(0, 7)
      }
      : item);
    if (!(await saveCurrentState())) {
      state.recurringExpenses = previousExpenses;
      return;
    }
    recurringEditDialog.close();
    render();
    showToast("Monthly outgoing updated.");
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
    monthPicker.value = cycleMonthForDate(transaction.date);
    resetTransactionView();
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
      state.recurringExpenses.length || state.recurringIncomes.length;
    if (!hasCurrentData) return true;
    const transactionCount = imported.transactions.length;
    const budgetCount = Object.keys(imported.budgets).length;
    const recurringCount = imported.recurringExpenses.length;
    const recurringIncomeCount = imported.recurringIncomes.length;
    return window.confirm(
      `Replace your current data with this CSV? It contains ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}, ${budgetCount} cycle budget${budgetCount === 1 ? "" : "s"}, ${recurringIncomeCount} recurring income item${recurringIncomeCount === 1 ? "" : "s"}, and ${recurringCount} recurring outgoing${recurringCount === 1 ? "" : "s"}.`
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
      state = preservePaydayWhenCsvHasNoSetting(candidate.state);
      storage.saveLocalCopy(state);
      syncCycleControls();
      resetTransactionView();
      render();
      updateCsvConnectionStatus(`Live CSV connected: ${candidate.handle.name}. Changes are saved to this file.`, true);
      showToast("CSV connected.");
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Could not connect the CSV file.", error);
      storageStatus.textContent = "Could not connect this CSV. Check that it is a valid BudgetGo CSV and try again.";
      showToast(error.message || "Couldn't connect the CSV file.");
    }
  }

  async function reconnectCsv() {
    try {
      const candidate = await storage.reconnectCsv();
      if (!confirmDataReplacement(candidate.state)) return;
      state = preservePaydayWhenCsvHasNoSetting(candidate.state);
      storage.saveLocalCopy(state);
      syncCycleControls();
      resetTransactionView();
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
        state = preservePaydayWhenCsvHasNoSetting(result.state);
        storage.saveLocalCopy(state);
        syncCycleControls();
        resetTransactionView();
        render();
        updateCsvConnectionStatus(`Live CSV connected: ${result.handle.name}. Changes are saved to this file.`, true);
      }
    } catch (error) {
      console.error("Could not restore the linked CSV.", error);
      storageStatus.textContent = "Could not check the saved CSV connection. CSV backups are still available.";
    }
  }

  async function openMonth() {
    if (!monthPicker.value) return;
    resetTransactionView();
    await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate);
    render();
  }

  async function initialize() {
    await restoreCsvConnection();
    syncCycleControls();
    resetTransactionView();
    await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate);
    render();
  }

  async function savePayday() {
    if (!paydayInput.reportValidity()) return;
    const paydayDay = Number(paydayInput.value);
    if (!Number.isInteger(paydayDay) || paydayDay < 1 || paydayDay > 31) return;
    const previous = state.paydayDay;
    state.paydayDay = paydayDay;
    if (!(await saveCurrentState())) {
      state.paydayDay = previous;
      paydayInput.value = String(previous);
      return;
    }
    resetTransactionView();
    monthPicker.value = cycleMonthForDate(localDate);
    await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate);
    render();
    showToast("Payday saved.");
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
      state = preservePaydayWhenCsvHasNoSetting(imported);
      if (!(await saveCurrentState())) {
        state = previous;
        return;
      }
      syncCycleControls();
      await ensureRecurringTransactions(cycleBounds(monthPicker.value).endDate);
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

  form.addEventListener("submit", event => handleFormSubmission(form, event, addTransaction));
  recurringForm.addEventListener("submit", event =>
    handleFormSubmission(recurringForm, event, addRecurringExpense));
  recurringIncomeForm.addEventListener("submit", event =>
    handleFormSubmission(recurringIncomeForm, event, addRecurringIncome));
  recurringEditForm.addEventListener("submit", event =>
    handleFormSubmission(recurringEditForm, event, saveRecurringExpenseEdits));
  document.getElementById("cancel-recurring-edit").addEventListener("click", () => recurringEditDialog.close());
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
  paydayInput.addEventListener("change", savePayday);
  previousTransactionsButton.addEventListener("click", () => {
    if (transactionPage === 0) return;
    transactionPage -= 1;
    render();
  });
  nextTransactionsButton.addEventListener("click", () => {
    transactionPage += 1;
    render();
  });
  loadMoreTransactionsButton.addEventListener("click", () => {
    mobileVisibleCount += transactionsPerPage;
    render();
  });
  mobileViewport.addEventListener("change", () => render());
  previousRecurringButton.addEventListener("click", () => {
    if (recurringExpensePage === 0) return;
    recurringExpensePage -= 1;
    renderRecurringLists();
  });
  nextRecurringButton.addEventListener("click", () => {
    recurringExpensePage += 1;
    renderRecurringLists();
  });
  loadMoreRecurringButton.addEventListener("click", () => {
    mobileRecurringVisibleCount += transactionsPerPage;
    renderRecurringLists();
  });
  themeToggle.addEventListener("click", toggleTheme);
  palettePicker.addEventListener("change", changePalette);
  window.addEventListener("storage", event => {
    if (event.key === "daybook-theme") {
      applyTheme(event.newValue === "dark" ? "dark" : "light", document.documentElement.dataset.palette);
    } else if (event.key === "budgetgo-palette") {
      const palette = ["blue", "green", "purple"].includes(event.newValue) ? event.newValue : "blue";
      applyTheme(document.documentElement.dataset.theme, palette);
    } else if (event.key === "daybook-budget-v1" && event.newValue) {
      try {
        const saved = JSON.parse(event.newValue);
        if (Number.isInteger(saved.paydayDay) && saved.paydayDay >= 1 && saved.paydayDay <= 31 &&
            saved.paydayDay !== state.paydayDay) {
          state.paydayDay = saved.paydayDay;
          syncCycleControls();
          resetTransactionView();
          render();
        }
      } catch (error) {
        console.error("Could not sync the saved payday setting.", error);
        showToast("Could not sync the payday setting from another tab.");
      }
    }
  });

  try {
    const theme = localStorage.getItem("daybook-theme") === "dark" ? "dark" : "light";
    const savedPalette = localStorage.getItem("budgetgo-palette");
    const palette = ["blue", "green", "purple"].includes(savedPalette) ? savedPalette : "blue";
    applyTheme(theme, palette);
  } catch (error) {
    console.error("Could not read the appearance preferences.", error);
    applyTheme("light", "blue");
  }
  updateTransactionForm();
  render();
  initialize();
})();
