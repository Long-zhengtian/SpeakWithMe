package me.speakwithme;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

final class BackupStore {
    private BackupStore() {}

    static String save(Context context, String filename, String contents) {
        try {
            String safe = filename == null ? "" : filename.replaceAll("[^A-Za-z0-9._-]", "");
            if (!safe.endsWith(".json")) safe = safe + ".json";
            if (Build.VERSION.SDK_INT >= 29) return Modern.save(context, safe, contents);
            return legacy(safe, contents);
        } catch (Exception error) {
            return "";
        }
    }

    private static String legacy(String filename, String contents) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) return "";
        File file = unusedFile(dir, filename);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(contents.getBytes(StandardCharsets.UTF_8));
        }
        return file.getAbsolutePath();
    }

    private static File unusedFile(File dir, String filename) {
        String base = filename.endsWith(".json") ? filename.substring(0, filename.length() - 5) : filename;
        File file = new File(dir, base + ".json");
        int extra = 2;
        while (file.exists() && extra < 50) {
            file = new File(dir, base + "-" + extra + ".json");
            extra += 1;
        }
        return file;
    }

    private static final class Modern {
        static String save(Context context, String filename, String contents) throws Exception {
            ContentResolver resolver = context.getContentResolver();
            String name = unusedName(resolver, filename);
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) return "";
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    resolver.delete(uri, null, null);
                    return "";
                }
                out.write(contents.getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) {
                resolver.delete(uri, null, null);
                throw error;
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return storedPath(resolver, uri, name);
        }

        private static String storedPath(ContentResolver resolver, Uri uri, String name) {
            try (Cursor cursor = resolver.query(
                uri,
                new String[] {MediaStore.MediaColumns.DATA, MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.DISPLAY_NAME},
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    String data = cursor.getString(0);
                    if (data != null && !data.isEmpty()) return data;
                    String relative = cursor.getString(1);
                    String display = cursor.getString(2);
                    if (relative != null && !relative.isEmpty() && display != null && !display.isEmpty()) {
                        String folder = relative.endsWith("/") ? relative : relative + "/";
                        return "/storage/emulated/0/" + folder + display;
                    }
                }
            } catch (Exception ignored) {
                // Some phones hide the absolute column. Fall through to the public Download path.
            }
            return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), name).getAbsolutePath();
        }

        private static String unusedName(ContentResolver resolver, String filename) {
            String base = filename.endsWith(".json") ? filename.substring(0, filename.length() - 5) : filename;
            String name = base + ".json";
            int extra = 2;
            while (exists(resolver, name) && extra < 50) {
                name = base + "-" + extra + ".json";
                extra += 1;
            }
            return name;
        }

        private static boolean exists(ContentResolver resolver, String name) {
            try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[] {MediaStore.Downloads._ID},
                MediaStore.Downloads.DISPLAY_NAME + "=?",
                new String[] {name},
                null
            )) {
                return cursor != null && cursor.moveToFirst();
            }
        }
    }
}
