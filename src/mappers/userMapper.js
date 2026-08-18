const { getProfilePictureUrl } = require('../utils/storage');

/*
 * Maps a users DB row (snake_case) to the domain/API
 * representation (camelCase) used everywhere outside
 * the persistence layer.
 *
 * Routes SELECT only the columns they need, so a row
 * passed in here may be missing some fields. Any field
 * missing from the row maps to `undefined`, which
 * `res.json()` drops from the serialized response —
 * so callers can safely pass a partial row and get back
 * only the corresponding subset of the domain shape.
 */
function mapUser(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        handle: row.handle,
        displayName: row.display_name,
        privateProfile: row.private_profile,
        description: row.description,
        profilePictureUrl: getProfilePictureUrl(
            row.profile_picture_path
        )
    };
}

module.exports = { mapUser };