import requests
from bs4 import BeautifulSoup
import json
import os
import re

TEST_MODE = False # Auf True setzen, um nur cT/Tran und D&H zu crawlen

def main():
    url = "https://www.decoderdb.de/datenbank/hersteller"
    print(f"Lade Herstellerliste von {url}...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except Exception as e:
        print(f"Fehler beim Laden der Seite: {e}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    hersteller_liste = []
    links = soup.find_all('a', href=True)
    for link in links:
        path = link['href']
        if '/datenbank/hersteller/' in path and path.strip('/') != 'datenbank/hersteller':
            name = link.get_text(strip=True)
            if name and name not in ["Hersteller", "Manufacturer"]:
                full_url = f"https://www.decoderdb.de{path}" if path.startswith('/') else path
                if not any(h['url'] == full_url for h in hersteller_liste):
                    hersteller_liste.append({"name": name, "url": full_url})
    
    if TEST_MODE:
        print("TEST_MODE AKTIV: Filtere auf cT / Tran und D&H...")
        hersteller_liste = [h for h in hersteller_liste if h['name'] in ["cT / Tran", "D&H"]]
    
    print(f"\nSuche Decoder für {len(hersteller_liste)} Hersteller...")
    
    import time
    
    for i, hersteller in enumerate(hersteller_liste):
        print(f"[{i+1}/{len(hersteller_liste)}] Lade Decoder für: {hersteller['name']}...")
        hersteller['decoder'] = []
        
        try:
            time.sleep(0.5)
            resp = requests.get(hersteller['url'], headers=headers)
            resp.raise_for_status()
            h_soup = BeautifulSoup(resp.text, 'html.parser')
            
            d_rows = h_soup.select('table.datatable tbody tr')
            
            if d_rows:
                for d_row in d_rows:
                    d_cols = d_row.find_all('td')
                    if len(d_cols) < 8: continue
                    
                    d_link = d_cols[0].find('a')
                    if d_link:
                        d_name = d_link.get_text(strip=True)
                        d_path = d_link.get('href')
                        d_url = f"https://www.decoderdb.de{d_path}" if d_path.startswith('/') else d_path
                        
                        # Neue Felder extrahieren
                        type_span = d_cols[1].find('span', class_='fa')
                        d_type = "Unbekannt"
                        if type_span:
                            t_title = type_span.get('title', '')
                            if t_title:
                                d_type = t_title
                            else:
                                classes = type_span.get('class', [])
                                if "decoder-type-3" in classes: d_type = "Lok-Decoder"
                                elif "decoder-type-4" in classes: d_type = "Sound-Decoder"
                                elif "decoder-type-1" in classes: d_type = "Funktions-Decoder"
                        
                        in_production = bool(d_cols[2].find('span', class_='in-production'))
                        
                        # Hilfsfunktion zum Bereinigen von Zahlen
                        def clean_num(text):
                            match = re.search(r'[\d\.]+', text.replace(',', '.'))
                            return float(match.group()) if match else 0.0

                        hersteller['decoder'].append({
                            "name": d_name, 
                            "url": d_url,
                            "type": d_type,
                            "in_production": in_production,
                            "max_current": clean_num(d_cols[3].get_text(strip=True)),
                            "max_voltage": clean_num(d_cols[4].get_text(strip=True)),
                            "fa_count": int(clean_num(d_cols[5].get_text(strip=True))),
                            "length": clean_num(d_cols[6].get_text(strip=True)),
                            "width": clean_num(d_cols[7].get_text(strip=True)),
                            "height": clean_num(d_cols[8].get_text(strip=True)) if len(d_cols) > 8 else 0.0
                        })
            
            # Fallback falls keine Tabelle gefunden wurde
            if not hersteller['decoder']:
                d_links = h_soup.find_all('a', href=True)
                for link in d_links:
                    path = link['href']
                    if '/datenbank/decoder/' in path and path.strip('/') != 'datenbank/decoder':
                        name = link.get_text(strip=True)
                        if name and name not in ["Decoder"]:
                            d_url = f"https://www.decoderdb.de{path}" if path.startswith('/') else path
                            if not any(d['url'] == d_url for d in hersteller['decoder']):
                                hersteller['decoder'].append({"name": name, "url": d_url, "type": "Unbekannt", "in_production": False, "max_current": 0.0, "max_voltage": 0.0, "fa_count": 0, "length": 0.0, "width": 0.0, "height": 0.0})
                                
            print(f"  -> {len(hersteller['decoder'])} Decoder gefunden.")
            
        except Exception as e:
            print(f"  -> Fehler beim Laden der Decoder für {hersteller['name']}: {e}")
    
    # Decoder ermittelt, nun für jeden Decoder die Firmware laden
    print(f"\nSuche Firmware-Informationen für alle Decoder...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(os.path.dirname(script_dir), 'decoder', 'decoderdaten.json')

    def flush_json(fertige_liste):
        """Schreibt den aktuellen Stand der Liste sofort in die JSON-Datei."""
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(fertige_liste, f, ensure_ascii=False, indent=4)

    firmware_cache = {} # URL -> List of applicable decoders
    
    for i, hersteller in enumerate(hersteller_liste):
        print(f"[{i+1}/{len(hersteller_liste)}] Verarbeite Decoder für: {hersteller['name']}...")    
        
        for d in hersteller.get('decoder', []):
            d['latest_firmware_url'] = None
            d['applicable_decoders'] = []
            
            try:
                time.sleep(0.5)
                d_resp = requests.get(d['url'], headers=headers)
                d_resp.raise_for_status()
                d_soup = BeautifulSoup(d_resp.text, 'html.parser')
                
                fw_link_tag = d_soup.find('a', href=re.compile(r'/datenbank/firmware/'))
                
                if fw_link_tag:
                    fw_path = fw_link_tag.get('href')
                    fw_url = f"https://www.decoderdb.de{fw_path}" if fw_path.startswith('/') else fw_path
                    d['latest_firmware_url'] = fw_url
                    
                    if fw_url in firmware_cache:
                        d['latest_firmware_file_url'] = firmware_cache[fw_url]['file_url']
                        d['applicable_decoders'] = firmware_cache[fw_url]['decoders']
                    else:
                        time.sleep(0.5)
                        fw_resp = requests.get(fw_url, headers=headers)
                        fw_resp.raise_for_status()
                        fw_soup = BeautifulSoup(fw_resp.text, 'html.parser')
                        
                        file_link_tag = fw_soup.find('a', href=re.compile(r'decoderFirmwareFile='))
                        file_url = None
                        if file_link_tag:
                            file_path = file_link_tag.get('href')
                            file_url = f"https://www.decoderdb.de{file_path}" if file_path.startswith('/') else file_path
                        
                        d['latest_firmware_file_url'] = file_url

                        app_decoders = []
                        fw_table = fw_soup.select('table tbody tr')
                        for row in fw_table:
                            cols = row.find_all('td')
                            if cols:
                                link = cols[0].find('a')
                                if link:
                                    app_decoders.append(link.get_text(strip=True))
                        
                        firmware_cache[fw_url] = {
                            'file_url': file_url,
                            'decoders': app_decoders
                        }
                        d['applicable_decoders'] = app_decoders
            except Exception as e:
                pass
        
        # Nach jedem Hersteller sofort in Datei schreiben
        flush_json(hersteller_liste[:i+1])
        print(f"  -> Zwischenstand gespeichert ({i+1}/{len(hersteller_liste)} Hersteller).")
    
    print(f"\nErfolg! {len(hersteller_liste)} Hersteller gespeichert in '{output_file}'.")

if __name__ == "__main__":
    # Prüfe ob Abhängigkeiten vorhanden sind
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("Erforderliche Bibliotheken fehlen. Installiere 'requests' und 'beautifulsoup4'...")
        os.system('pip install requests beautifulsoup4')
        import requests
        from bs4 import BeautifulSoup
        
    main()
