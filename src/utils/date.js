function extractPublishedYear(date) {
    if (!date) return null;

    const match = String(date).match(/^\d{4}/);

    return match ? Number(match[0]) : null;
}

const MIN_LOAN_DAYS = 7;
const MAX_LOAN_DAYS = 90;
const DEFAULT_LOAN_DAYS = 30;

function todayMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function defaultDueDate() {
    const due = todayMidnight();
    due.setDate(due.getDate() + DEFAULT_LOAN_DAYS);
    return toIsoDate(due);
}

function isDueDateInRange(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }

    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }

    const diffDays = Math.round(
        (parsed - todayMidnight()) / (24 * 60 * 60 * 1000)
    );

    return diffDays >= MIN_LOAN_DAYS && diffDays <= MAX_LOAN_DAYS;
}

module.exports = {
    extractPublishedYear,
    MIN_LOAN_DAYS,
    MAX_LOAN_DAYS,
    DEFAULT_LOAN_DAYS,
    defaultDueDate,
    isDueDateInRange,
    toIsoDate
};