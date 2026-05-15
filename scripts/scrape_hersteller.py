import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import os

def scrape_hersteller():
    url = "https://www.decoderdb.de/datenbank/hersteller"
    
    try:
        # Seite abrufen
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # HTML parsen
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Debug: Ausgeben um die Struktur zu verstehen
        print("Seite erfolgreich geladen")
        print(f"Response Status: {response.status_code}")
        
        hersteller_list = []
        
        # Passe diese Selektoren an die tatsächliche HTML-Struktur an
        # Dies sind Platzhalter - du musst die echte Struktur inspizieren
        hersteller_elements = soup.find_all('a', class_='hersteller-link')
        
        if not hersteller_elements:
            # Alternative: Versuche eine andere Struktur
            hersteller_elements = soup.find_all('tr')
            print(f"Gefundene <tr>: {len(hersteller_elements)}")
        
        for element in hersteller_elements:
            try:
                if element.name == 'a':
                    name = element.get_text(strip=True)
                    link = element.get('href', '')
                    if link and not link.startswith('http'):
                        link = 'https://www.decoderdb.de' + link
                else:
                    # Falls es eine Tabellenzelle ist
                    td = element.find('td')
                    if td:
                        link_tag = td.find('a')
                        if link_tag:
                            name = link_tag.get_text(strip=True)
                            link = link_tag.get('href', '')
                            if link and not link.startswith('http'):
                                link = 'https://www.decoderdb.de' + link
                        else:
                            continue
                    else:
                        continue
                
                if name and link:
                    hersteller_list.append({
                        'name': name,
                        'url': link
                    })
            except Exception as e:
                print(f"Fehler beim Parsen eines Elements: {e}")
                continue
        
        # Sortiere nach Namen
        hersteller_list.sort(key=lambda x: x['name'].lower())
        
        # JSON speichern
        output = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'source': url,
            'count': len(hersteller_list),
            'hersteller': hersteller_list
        }
        
        os.makedirs('data', exist_ok=True)
        
        with open('hersteller.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Erfolgreich! {len(hersteller_list)} Hersteller gespeichert")
        return True
        
    except Exception as e:
        print(f"❌ Fehler beim Scraping: {e}")
        return False

if __name__ == '__main__':
    scrape_hersteller()
