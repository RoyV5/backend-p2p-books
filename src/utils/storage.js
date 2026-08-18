const supabase = require('../config/supabase');

/*
 * Derives a client-facing URL from a stored Supabase storage path.
 *
 * The database only ever persists the raw storage path
 * (e.g. "avatars/abc123.jpg"), never a full URL. The full URL is
 * infrastructure-specific and derivable at read time, so
 * constructing it is centralized here rather than repeated
 * wherever a profile_picture_path is read.
 */
function getProfilePictureUrl(path) {
    if (!path) {
        return null;
    }

    const { data } = supabase
        .storage
        .from(process.env.SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
}

module.exports = { getProfilePictureUrl };