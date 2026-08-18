function escapeLikeTerm(term) {
    return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

module.exports = { escapeLikeTerm };