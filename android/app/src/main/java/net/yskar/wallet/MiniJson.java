package net.yskar.wallet;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Kleinstes JSON fuer den nativen Miner.
 *
 * Warum nicht org.json: Der Miner-Kern soll ohne Android laufen, damit er
 * auf dem Rechner gegen einen echten Knoten getestet werden kann
 * (android/pruefung). org.json gibt es dort nicht.
 *
 * Zahlen bleiben Text. Difficulty, Extranonce und Betraege sind auf der
 * Kette ganze Zahlen beliebiger Groesse -- ein double wuerde sie runden.
 */
final class MiniJson {
    private final String s;
    private int i;

    private MiniJson(String s) { this.s = s; }

    /** Objekt lesen; alles andere -> IllegalArgumentException. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> objekt(String text) {
        MiniJson p = new MiniJson(text);
        p.leer();
        Object o = p.wert();
        if (!(o instanceof Map)) throw new IllegalArgumentException("kein JSON-Objekt");
        return (Map<String, Object>) o;
    }

    /** Wert als Text; Zahlen und Wahrheitswerte wie geschrieben, null -> null. */
    static String text(Map<String, Object> m, String k) {
        Object o = m.get(k);
        if (o == null) return null;
        if (o instanceof Map || o instanceof List) return null;
        return String.valueOf(o);
    }

    static boolean wahr(Map<String, Object> m, String k) {
        Object o = m.get(k);
        return o instanceof Boolean && (Boolean) o;
    }

    static long zahl(Map<String, Object> m, String k, long sonst) {
        String t = text(m, k);
        if (t == null) return sonst;
        try { return Long.parseLong(t); }
        catch (NumberFormatException e) {
            try { return (long) Double.parseDouble(t); } catch (NumberFormatException e2) { return sonst; }
        }
    }

    /** Text als JSON-Zeichenkette (mit Anfuehrungszeichen). */
    static String zk(String t) {
        if (t == null) return "null";
        StringBuilder b = new StringBuilder(t.length() + 2).append('"');
        for (int k = 0; k < t.length(); k++) {
            char c = t.charAt(k);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    /** Beliebigen gelesenen Wert wieder als JSON schreiben (fuer Durchreichen). */
    @SuppressWarnings("unchecked")
    static String schreiben(Object o) {
        if (o == null) return "null";
        if (o instanceof Boolean) return o.toString();
        if (o instanceof Zahl) return o.toString();
        if (o instanceof String) return zk((String) o);
        if (o instanceof Map) {
            StringBuilder b = new StringBuilder("{");
            boolean erst = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!erst) b.append(',');
                erst = false;
                b.append(zk(e.getKey())).append(':').append(schreiben(e.getValue()));
            }
            return b.append('}').toString();
        }
        if (o instanceof List) {
            StringBuilder b = new StringBuilder("[");
            boolean erst = true;
            for (Object x : (List<Object>) o) { if (!erst) b.append(','); erst = false; b.append(schreiben(x)); }
            return b.append(']').toString();
        }
        return zk(String.valueOf(o));
    }

    /** Zahl, unveraendert als Text gespeichert. */
    static final class Zahl {
        final String roh;
        Zahl(String roh) { this.roh = roh; }
        @Override public String toString() { return roh; }
    }

    // ------------------------------------------------------------------

    private Object wert() {
        leer();
        if (i >= s.length()) throw fehler("Ende");
        char c = s.charAt(i);
        if (c == '{') return objekt();
        if (c == '[') return liste();
        if (c == '"') return zeichenkette();
        if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
        if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
        if (s.startsWith("null", i)) { i += 4; return null; }
        int a = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        if (a == i) throw fehler("unerwartetes Zeichen");
        return new Zahl(s.substring(a, i));
    }

    private Map<String, Object> objekt() {
        Map<String, Object> m = new LinkedHashMap<>();
        i++;
        leer();
        if (zeichen() == '}') { i++; return m; }
        while (true) {
            leer();
            if (zeichen() != '"') throw fehler("Schluessel erwartet");
            String k = zeichenkette();
            leer();
            if (zeichen() != ':') throw fehler("':' erwartet");
            i++;
            m.put(k, wert());
            leer();
            char c = zeichen();
            i++;
            if (c == '}') return m;
            if (c != ',') throw fehler("',' erwartet");
        }
    }

    private List<Object> liste() {
        List<Object> l = new ArrayList<>();
        i++;
        leer();
        if (zeichen() == ']') { i++; return l; }
        while (true) {
            l.add(wert());
            leer();
            char c = zeichen();
            i++;
            if (c == ']') return l;
            if (c != ',') throw fehler("',' erwartet");
        }
    }

    private String zeichenkette() {
        StringBuilder b = new StringBuilder();
        i++;
        while (true) {
            if (i >= s.length()) throw fehler("offene Zeichenkette");
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c != '\\') { b.append(c); continue; }
            char e = s.charAt(i++);
            switch (e) {
                case 'n': b.append('\n'); break;
                case 't': b.append('\t'); break;
                case 'r': b.append('\r'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                default: b.append(e);
            }
        }
    }

    private char zeichen() {
        if (i >= s.length()) throw fehler("Ende");
        return s.charAt(i);
    }

    private void leer() {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
    }

    private IllegalArgumentException fehler(String was) {
        return new IllegalArgumentException("JSON: " + was + " bei " + i);
    }
}
