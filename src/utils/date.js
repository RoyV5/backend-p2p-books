function extractPublishedYear(date) {
    if (!date) return null;

    const match = String(date).match(/^\d{4}/);

    return match ? Number(match[0]) : null;
}

module.exports = extractPublishedYear;