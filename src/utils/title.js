function normalizeTitle(title) {
    if (!title) return null;

    const isAllUppercase =
        title === title.toUpperCase();

    const isAllLowercase =
        title === title.toLowerCase();

    if (!isAllUppercase && !isAllLowercase) {
        return title;
    }

    return title
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}
module.exports = normalizeTitle;