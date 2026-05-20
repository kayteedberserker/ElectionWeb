// app/api/locations/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper utility to normalize strings safely for comparison
function normalizeString(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, ''); // Strips slashes, dashes, and spaces for pure alphanumeric matching
}

// Hardcoded static lookup matrices for fast operational resolution
const SENATORIAL_DISTRICTS_MAP = {
    "ABIA": [
        { "name": "Abia North", "lgas": ["Arochukwu", "Bende", "Isialangwa North", "Isialangwa South", "Umunneochi"] },
        { "name": "Abia Central", "lgas": ["Ikwuano", "Isiala Ngwa North", "Isiala Ngwa South", "Umuahia North", "Umuahia South", "Osisioma"] },
        { "name": "Abia South", "lgas": ["Aba North", "Aba South", "Obingwa", "Ugwunagbo", "Ukwa East", "Ukwa West"] }
    ],
    "ADAMAWA": [
        { "name": "Adamawa North", "lgas": ["Madagali", "Maiha", "Mubi North", "Mubi South", "Michika"] },
        { "name": "Adamawa Central", "lgas": ["Fufore", "Gombi", "Girei", "Hong", "Song", "Yola North", "Yola South"] },
        { "name": "Adamawa South", "lgas": ["Demsa", "Guyuk", "Ganye", "Jada", "Lamurde", "Numan", "Shelleng", "Toungo", "Mayo-Belwa"] }
    ],
    "AKWA-IBOM": [
        { "name": "Akwa Ibom North-East", "lgas": ["Uyo", "Uruan", "Nsit Atai", "Ibesikpo Asutan", "Nsit Ibom", "Nsit Ubium", "Etinan", "Itu", "Ibiono Ibom"] },
        { "name": "Akwa Ibom North-West", "lgas": ["Abak", "Essien Udim", "Etim Ekpo", "Ika", "Ikono", "Ikot Ekpene", "Ini", "Obot Akara", "Oruk Anam", "Ukanafun"] },
        { "name": "Akwa Ibom South", "lgas": ["Eket", "Esit Eket", "Onna", "Ibeno", "Mkpat Enin", "Ikot Abasi", "Eastern Obolo", "Oron", "Udung Uko", "Mbo", "Urue Offong/Oruko", "Okobo"] }
    ],
    "ANAMBRA": [
        { "name": "Anambra North", "lgas": ["Onitsha North", "Onitsha South", "Oyi", "Ogbaru", "Anambra East", "Anambra West", "Ayamelum"] },
        { "name": "Anambra Central", "lgas": ["Awka North", "Awka South", "Njikoka", "Anaocha", "Idemili North", "Idemili South", "Dunukofia"] },
        { "name": "Anambra South", "lgas": ["Ihiala", "Nnewi North", "Nnewi South", "Orumba South", "Orumba North", "Aguata", "Ekwusigo"] }
    ],
    "BAUCHI": [
        { "name": "Bauchi North", "lgas": ["Gamawa", "Dambam", "Zaki", "Katagum", "Giade", "Shira", "Itas/Gadau"] },
        { "name": "Bauchi Central", "lgas": ["Ningii", "Warji", "Darazo", "Misau", "Ganjuwa", "Dass"] },
        { "name": "Bauchi South", "lgas": ["Bauchi", "Toro", "Alkaleri", "Kirfi", "Bogoro", "Tafawa Balewa"] }
    ],
    "BAYELSA": [
        { "name": "Bayelsa Central", "lgas": ["Southern Ijaw", "Yenagoa", "Kolokuma/Opokuma"] },
        { "name": "Bayelsa East", "lgas": ["Brass", "Nembe", "Ogbia"] },
        { "name": "Bayelsa West", "lgas": ["Sagbama", "Ekeremor"] }
    ],
    "BENUE": [
        { "name": "Benue North-East", "lgas": ["Katsina-Ala", "Konshisha", "Kwande", "Logo", "Ukum", "Ushongo", "Vandeikya"] },
        { "name": "Benue North-West", "lgas": ["Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Makurdi", "Tarka"] },
        { "name": "Benue South", "lgas": ["Ado", "Agatu", "Apa", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu", "Otukpo"] }
    ],
    "BORNO": [
        { "name": "Borno North", "lgas": ["Abadam", "Gubio", "Guzamala", "Kaga", "Kukawa", "Mafa", "Magumeri", "Marte", "Monguno", "Nganzai"] },
        { "name": "Borno Central", "lgas": ["Bama", "Dikwa", "Jere", "Konduga", "Mafa", "Maiduguri", "Ngala", "Kala/Balge"] },
        { "name": "Borno South", "lgas": ["Askira/Uba", "Bayo", "Biu", "Chibok", "Damboa", "Gwoza", "Hawul", "Kwaya Kusar", "Shani"] }
    ],
    "CROSS RIVER": [
        { "name": "Cross River North", "lgas": ["Bekwarra", "Obudu", "Obanliku", "Ogoja", "Yala"] },
        { "name": "Cross River Central", "lgas": ["Abi", "Boki", "Ikom", "Obubra", "Yakurr", "Etung"] },
        { "name": "Cross River South", "lgas": ["Akpabuyo", "Bakassi", "Calabar Municipality", "Calabar South", "Odukpani", "Akamkpa", "Biase"] }
    ],
    "DELTA": [
        { "name": "Delta North", "lgas": ["Aniocha North", "Aniocha South", "Ika North East", "Ika South", "Ndokwa East", "Ndokwa West", "Oshimili North", "Oshimili South", "Ukwuani"] },
        { "name": "Delta Central", "lgas": ["Ethiope East", "Ethiope West", "Okpe", "Sapele", "Udu", "Ughelli North", "Ughelli South", "Uvwie"] },
        { "name": "Delta South", "lgas": ["Bomadi", "Burutu", "Isoko North", "Isoko South", "Patani", "Warri North", "Warri South", "Warri South West"] }
    ],
    "EBONYI": [
        { "name": "Ebonyi North", "lgas": ["Abakaliki", "Ebonyi", "Ishielu", "Izzi", "Ohaukwu"] },
        { "name": "Ebonyi Central", "lgas": ["Ikwo", "Ezza North", "Ezza South"] },
        { "name": "Ebonyi South", "lgas": ["Afikpo North", "Afikpo South", "Ivo", "Ohaozara", "Onicha"] }
    ],
    "EDO": [
        { "name": "Edo North", "lgas": ["Akoko-Edo", "Etsako Central", "Etsako East", "Etsako West", "Owan East", "Owan West"] },
        { "name": "Edo Central", "lgas": ["Esan Central", "Esan North-East", "Esan South-East", "Esan West", "Igueben"] },
        { "name": "Edo South", "lgas": ["Oredo", "Ovia North-East", "Ovia South-West", "Egor", "Ikpoba-Okha", "Uhunmwonde", "Orhionmwon"] }
    ],
    "EKITI": [
        { "name": "Ekiti North", "lgas": ["Ikole", "Iye", "Ido/Osi", "Moba", "Ilejemeje"] },
        { "name": "Ekiti Central", "lgas": ["Ado-Ekiti", "Efon", "Ekiti West", "Iyin/Irepodun/Ifelodun", "Ijero"] },
        { "name": "Ekiti South", "lgas": ["Ekiti South-West", "Ikere", "Emure", "Ise/Orun", "Gbonyin", "Omuo/Ekiti East"] }
    ],
    "ENUGU": [
        { "name": "Enugu North", "lgas": ["Igbo-Eze North", "Igbo-Eze South", "Nsukka", "Udenu", "Igbo-Etiti", "Uzo-Uwani"] },
        { "name": "Enugu Central", "lgas": ["Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Isi-Uzo"] },
        { "name": "Enugu South", "lgas": ["Nkanu East", "Nkanu West", "Oji-River", "Udi", "Ezeagu"] }
    ],
    "GOMBE": [
        { "name": "Gombe North", "lgas": ["Dukku", "Funakaye", "Gombe", "Kwami", "Nafada"] },
        { "name": "Gombe Central", "lgas": ["Akko", "Yamaltu/Deba"] },
        { "name": "Gombe South", "lgas": ["Balanga", "Billiri", "Kaltungo", "Shongom"] }
    ],
    "IMO": [
        { "name": "Imo North", "lgas": ["Ehime Mbano", "Ihitte/Uboma", "Isiala Mbano", "Obowo", "Onuimo", "Okigwe"] },
        { "name": "Imo Central", "lgas": ["Aboh Mbaise", "Ahiazu Mbaise", "Ezinihitte", "Ikeduru", "Mbaitoli", "Ngor Okpala", "Owerri Municipal", "Owerri North", "Owerri West"] },
        { "name": "Imo South", "lgas": ["Ideato North", "Ideato South", "Isu", "Njaba", "Nwangele", "Nkwerre", "Oguta", "Ohaji/Egbema", "Orlu", "Orsu", "Oru East", "Oru West"] }
    ],
    "JIGAWA": [
        { "name": "Jigawa North-West", "lgas": ["Babura", "Garki", "Gumel", "Gagarawa", "Maigatari", "Malam Madori", "Suletankarkar", "Taura", "Ringim", "Kazaure", "Roni", "Yankwashi", "Gwiwa"] },
        { "name": "Jigawa North-East", "lgas": ["Auuyo", "Hadejia", "Kafin Hausa", "Kaugama", "Kirikasamma", "Birniwa", "Malam Madori"] },
        { "name": "Jigawa South-West", "lgas": ["Birnin Kudu", "Buji", "Dutse", "Gwaram", "Jahun", "Kiyawa", "Miga", "Kaugama", "Guri"] }
    ],
    "KADUNA": [
        { "name": "Kaduna North", "lgas": ["Ikara", "Kubau", "Kudan", "Makarfi", "Sabon Gari", "Soba", "Zaria", "Lere"] },
        { "name": "Kaduna Central", "lgas": ["Birnin Gwari", "Chikun", "Giwa", "Igabi", "Kaduna North", "Kaduna South", "Kajuru"] },
        { "name": "Kaduna South", "lgas": ["Jaba", "Jema'a", "Kachia", "Kagarko", "Kaura", "Kauru", "Sanga", "Zangon Kataf"] }
    ],
    "KANO": [
        { "name": "Kano North", "lgas": ["Bagwai", "Bichi", "Dambatta", "Gwarzo", "Kabò", "Karaye", "Kunchi", "Makoda", "Rimin Gado", "Shanono", "Tofa", "Tsanyawa"] },
        { "name": "Kano Central", "lgas": ["Dala", "Fagge", "Gwale", "Kano Municipal", "Nasarawa", "Tarauni", "Ungogo", "Kumbotso", "Minjibir", "Gezawa", "Dawakin Tofa", "Warawa", "Kura", "Madobi", "Garun Mallam"] },
        { "name": "Kano South", "lgas": ["Albasu", "Bebeji", "Bunkure", "Doguwa", "Gaya", "Kiru", "Takai", "Wudil", "Tudun Wada", "Rano", "Kibiya", "Sumaila", "Garko", "Ajingi"] }
    ],
    "KATSINA": [
        { "name": "Katsina North", "lgas": ["Daura", "Baure", "Bindawa", "Mai'Adua", "Mani", "Mashi", "Sandamu", "Zango", "Ingawa", "Kankia", "Kusada"] },
        { "name": "Katsina Central", "lgas": ["Batsari", "Batagarawa", "Charanchi", "DanMusa", "Dutsin-Ma", "Jibia", "Katsina", "Kurfi", "Kaita", "Rimi", "Safana"] },
        { "name": "Katsina South", "lgas": ["Bakori", "Danja", "Funtua", "Faskari", "Kafur", "Malumfashi", "Matazu", "Musawa", "Sabuwa", "Dandume"] }
    ],
    "KEBBI": [
        { "name": "Kebbi North", "lgas": ["Arewa Dandi", "Argungu", "Augie", "Bagudo", "Dandi", "Jega", "Suru"] },
        { "name": "Kebbi Central", "lgas": ["Aliero", "Birnin Kebbi", "Bunza", "Gwandu", "Kalgo", "Koko/Besse", "Maiyama"] },
        { "name": "Kebbi South", "lgas": ["Danko/Wasagu", "Fakai", "Ngaski", "Sakaba", "Shanga", "Yauri", "Zuru"] }
    ],
    "KOGI": [
        { "name": "Kogi North", "lgas": ["Adavi", "Ajaokuta", "Ijumu", "Kabba/Bunu", "Kogi", "Lokoja", "Mopa-Muro", "Ogori/Magongo", "Okehi", "Okene", "Olamaboro", "Yagba East", "Yagba West"] },
        { "name": "Kogi Central", "lgas": ["Adavi", "Ajaokuta", "Okehi", "Okene", "Ogori/Magongo"] },
        { "name": "Kogi East", "lgas": ["Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela-Odolu", "Ofu", "Olamaboro", "Omala"] }
    ],
    "KWARA": [
        { "name": "Kwara North", "lgas": ["Baruten", "Edu", "Kaiama", "Moro", "Pategi"] },
        { "name": "Kwara Central", "lgas": ["Asa", "Ilorin East", "Ilorin South", "Ilorin West"] },
        { "name": "Kwara South", "lgas": ["Ekiti", "Isin", "Irepodun", "Ifelodun", "Offa", "Oke Ero", "Oyun"] }
    ],
    "LAGOS": [
        { "name": "Lagos West", "lgas": ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Badagry", "Ifako-Ijaiye", "Ikeja", "Mushin", "Ojo", "Oshodi-Isolo"] },
        { "name": "Lagos Central", "lgas": ["Apapa", "Eti-Osa", "Lagos Island", "Lagos Mainland", "Surulere"] },
        { "name": "Lagos East", "lgas": ["Shomolu", "Kosofe", "Epe", "Ikorodu", "Ibeju-Lekki"] }
    ],
    "NASARAWA": [
        { "name": "Nasarawa North", "lgas": ["Akwanga", "Nasarawa Eggon", "Wamba"] },
        { "name": "Nasarawa Central", "lgas": ["Doma", "Kokona", "Lafia", "Nasarawa", "Keana", "Awe"] },
        { "name": "Nasarawa West", "lgas": ["Karu", "Keffi", "Kokona", "Nasarawa", "Toto"] }
    ],
    "NIGER": [
        { "name": "Niger North", "lgas": ["Agwara", "Borgu", "Kontagora", "Magama", "Mariga", "Mashegu", "Rijau", "Wushishi"] },
        { "name": "Niger East", "lgas": ["Bosso", "Chanchaga", "Gurara", "Paikoro", "Rafi", "Shiroro", "Suleja", "Tafa", "Munya"] },
        { "name": "Niger South", "lgas": ["Agaie", "Bida", "Edati", "Gbako", "Katcha", "Lapai", "Mokwa", "Lavun"] }
    ],
    "OGUN": [
        { "name": "Ogun Central", "lgas": ["Abeokuta North", "Abeokuta South", "Ewekoro", "Ifo", "Obafemi Owode", "Odeda"] },
        { "name": "Ogun East", "lgas": ["Ijebu Ode", "Ijebu North", "Ijebu North East", "Ijebu East", "Ikenne", "Odogbolu", "Remo North", "Sagamu", "Ogun Waterside"] },
        { "name": "Ogun West", "lgas": ["Imeko Afon", "Ipokia", "Yewa North", "Yewa South", "Ado-Odo/Ota"] }
    ],
    "ONDO": [
        { "name": "Ondo North", "lgas": ["Akoko North-East", "Akoko North-West", "Akoko South-East", "Akoko South-West", "Ose", "Owo"] },
        { "name": "Ondo Central", "lgas": ["Akure North", "Akure South", "Idanre", "Ifedore", "Ondo East", "Ondo West"] },
        { "name": "Ondo South", "lgas": ["Ese Odo", "Ilaje", "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa"] }
    ],
    "OYO": [
        { "name": "Oyo North", "lgas": ["Atisbo", "Irepo", "Iseyin", "Itesiwaju", "Iwajowa", "Kajola", "Ogbomoso North", "Ogbomoso South", "Olorunsogo", "Oorelope", "Oriire", "Saki East", "Saki West"] },
        { "name": "Oyo Central", "lgas": ["Afijio", "Akinyele", "Atiba", "Egbeda", "Lagelu", "Ogo Oluwa", "Oluyole", "Ona Ara", "Oyo East", "Oyo West", "Surulere"] },
        { "name": "Oyo South", "lgas": ["Ibadan North", "Ibadan North-East", "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido"] }
    ],
    "OSUN": [
        { "name": "Osun Central", "lgas": ["Boluwaduro", "Boripe", "Ifedayo", "Ifelodun", "Ila", "Irepodun", "Olorunda", "Odo Otin", "Orolu", "Osogbo"] },
        { "name": "Osun East", "lgas": ["Atakunmosa East", "Atakunmosa West", "Ife Central", "Ife East", "Ife North", "Ife South", "Ilesa East", "Ilesa West", "Obokun", "Oriade"] },
        { "name": "Osun West", "lgas": ["Ayedaade", "Ayedire", "Ede North", "Ede South", "Egbedore", "Ejigbo", "Iwo", "Isokan", "Irewole", "Ola Oluwa"] }
    ],
    "PLATEAU": [
        { "name": "Plateau North", "lgas": ["Barkin Ladi", "Bassa", "Jos East", "Jos North", "Jos South", "Riyom"] },
        { "name": "Plateau Central", "lgas": ["Bokkos", "Mangu", "Kanam", "Pankshin", "Kanke"] },
        { "name": "Plateau South", "lgas": ["Langtang North", "Langtang South", "Mikang", "Qua'an Pan", "Shendam", "Wase"] }
    ],
    "RIVERS": [
        { "name": "Rivers East", "lgas": ["Etche", "Omuma", "Ikwerre", "Obio/Akpor", "Port Harcourt", "Ogu/Bolo", "Okrika", "Tai"] },
        { "name": "Rivers South-East", "lgas": ["Andoni", "Opobo/Nkoro", "Khana", "Gokana", "Eleme", "Oyigbo"] },
        { "name": "Rivers West", "lgas": ["Ogba/Egbema/Ndoni", "Ahoada East", "Ahoada West", "Abua/Odual", "Degema", "Asari-Toru", "Akuku-Toru", "Bonny"] }
    ],
    "SOKOTO": [
        { "name": "Sokoto North", "lgas": ["Binji", "Gudu", "Illela", "Sabon Birni", "Tangaza", "Goronyo", "Isa", "Sokoto North", "Wurno"] },
        { "name": "Sokoto Central", "lgas": ["Sokoto South", "Kware", "Tureta", "Bodinga", "Shagari", "Silame", "Wamako"] },
        { "name": "Sokoto South", "lgas": ["Dange Shuni", "Gada", "Kebbe", "Rabah", "Tambuwal", "Yabo"] }
    ],
    "TARABA": [
        { "name": "Taraba North", "lgas": ["Ardo Kola", "Jalingo", "Kona", "Lau", "Karim Lamido", "Yorro", "Zing"] },
        { "name": "Taraba Central", "lgas": ["Bali", "Gashaka", "Gassol", "Kurmi", "Sardauna"] },
        { "name": "Taraba South", "lgas": ["Donga", "Ibi", "Takum", "Ussa", "Wukari"] }
    ],
    "YOBE": [
        { "name": "Yobe North", "lgas": ["Bade", "Jakusko", "Karasuwa", "Machina", "Nguru", "Yusufari"] },
        { "name": "Yobe Central", "lgas": ["Damaturu", "Gujba", "Gulani", "Fika", "Fune", "Nangere"] },
        { "name": "Yobe South", "lgas": ["Bursari", "Geidam", "Yunusari", "Potiskum", "Tarmuwa"] }
    ],
    "ZAMFARA": [
        { "name": "Zamfara North", "lgas": ["Shinkafi", "Zurmi", "Birnin Magaji/Kiyaw", "Kaura Namoda"] },
        { "name": "Zamfara Central", "lgas": ["Anka", "Bungudu", "Gusau", "Maru", "Tsafe"] },
        { "name": "Zamfara South", "lgas": ["Bakura", "Bukkuyum", "Gummi", "Maradun", "Talata Mafara"] }
    ],
    "FEDERAL CAPITAL TERRITORY": [
        { "name": "FCT Abuja", "lgas": ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Abuja Municipal"] }
    ]
};

const STATE_DISTRICTS_MAP = {
    "Abia": [
        {
            "district": "Aba Central",
            "lga": "Aba Central",
            "sen_district": "Abia South"
        },
        {
            "district": "Aba North",
            "lga": "Aba North",
            "sen_district": "Abia South"
        },
        {
            "district": "Aba South",
            "lga": "Aba South",
            "sen_district": "Abia South"
        },
        {
            "district": "Arochukwu",
            "lga": "Arochukwu",
            "sen_district": "Abia North"
        },
        {
            "district": "Bende North",
            "lga": "Bende North",
            "sen_district": "Abia North"
        },
        {
            "district": "Bende South",
            "lga": "Bende South",
            "sen_district": "Abia North"
        },
        {
            "district": "Ikwuano",
            "lga": "Ikwuano",
            "sen_district": "Abia Central"
        },
        {
            "district": "Isiala Ngwa North",
            "lga": "Isiala Ngwa North",
            "sen_district": "Abia Central"
        },
        {
            "district": "Isiala Ngwa South",
            "lga": "Isiala Ngwa South",
            "sen_district": "Abia Central"
        },
        {
            "district": "Isuikwuato",
            "lga": "Isuikwuato",
            "sen_district": "Abia North"
        },
        {
            "district": "Obingwa East",
            "lga": "Obingwa East",
            "sen_district": "Abia South"
        },
        {
            "district": "Obingwa West",
            "lga": "Obingwa West",
            "sen_district": "Abia South"
        },
        {
            "district": "Ohafia North",
            "lga": "Ohafia North",
            "sen_district": "Abia North"
        },
        {
            "district": "Ohafia South",
            "lga": "Ohafia South",
            "sen_district": "Abia North"
        },
        {
            "district": "Osisioma North",
            "lga": "Osisioma North",
            "sen_district": "Abia Central"
        },
        {
            "district": "Osisioma South",
            "lga": "Osisioma South",
            "sen_district": "Abia Central"
        },
        {
            "district": "Ugwunaagbo",
            "lga": "Ugwunaagbo",
            "sen_district": "Abia South"
        },
        {
            "district": "Ukwa East",
            "lga": "Ukwa East",
            "sen_district": "Abia South"
        },
        {
            "district": "Ukwa West",
            "lga": "Ukwa West",
            "sen_district": "Abia South"
        },
        {
            "district": "Umuahia Central",
            "lga": "Umuahia Central",
            "sen_district": "Abia Central"
        },
        {
            "district": "Umuahia East",
            "lga": "Umuahia East",
            "sen_district": "Abia Central"
        },
        {
            "district": "Umuahia North",
            "lga": "Umuahia North",
            "sen_district": "Abia Central"
        },
        {
            "district": "Umuahia South",
            "lga": "Umuahia South",
            "sen_district": "Abia Central"
        },
        {
            "district": "Umunneochi",
            "lga": "Umunneochi",
            "sen_district": "Abia North"
        }
    ],
    "Adamawa": [
        {
            "district": "Demsa",
            "lga": "Demsa",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Fufore/Gurin",
            "lga": [
                "Fufore",
                "Gurin"
            ],
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Ganye",
            "lga": "Ganye",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Girei",
            "lga": "Girei",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Gombi",
            "lga": "Gombi",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Guyuk",
            "lga": "Guyuk",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Hong",
            "lga": "Hong",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Jada/Mbulo",
            "lga": [
                "Jada",
                "Mbulo"
            ],
            "sen_district": "Adamawa South"
        },
        {
            "district": "Koma/Leko",
            "lga": [
                "Koma",
                "Leko"
            ],
            "sen_district": "Adamawa South"
        },
        {
            "district": "Lamurde",
            "lga": "Lamurde",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Madagali",
            "lga": "Madagali",
            "sen_district": "Adamawa North"
        },
        {
            "district": "Maiha",
            "lga": "Maiha",
            "sen_district": "Adamawa North"
        },
        {
            "district": "Mayo-Belwa",
            "lga": "Mayo-Belwa",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Michika",
            "lga": "Michika",
            "sen_district": "Adamawa North"
        },
        {
            "district": "Mubi North",
            "lga": "Mubi North",
            "sen_district": "Adamawa North"
        },
        {
            "district": "Mubi South",
            "lga": "Mubi South",
            "sen_district": "Adamawa North"
        },
        {
            "district": "Nassarawo/Binyeri",
            "lga": [
                "Nassarawo",
                "Binyeri"
            ],
            "sen_district": "Adamawa South"
        },
        {
            "district": "Numan",
            "lga": "Numan",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Shelleng",
            "lga": "Shelleng",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Song",
            "lga": "Song",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Toungo",
            "lga": "Toungo",
            "sen_district": "Adamawa South"
        },
        {
            "district": "Uba/Gaya",
            "lga": [
                "Uba",
                "Gaya"
            ],
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Verre",
            "lga": "Verre",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Yola North",
            "lga": "Yola North",
            "sen_district": "Adamawa Central"
        },
        {
            "district": "Yola South",
            "lga": "Yola South",
            "sen_district": "Adamawa Central"
        }
    ],
    "Akwa Ibom": [
        {
            "district": "Abak",
            "lga": "Abak",
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Eket",
            "lga": "Eket",
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Esit Eket/Ibeno",
            "lga": [
                "Esit Eket",
                "Ibeno"
            ],
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Etim Ekpo/Ika",
            "lga": [
                "Etim Ekpo",
                "Ika"
            ],
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Etinan",
            "lga": "Etinan",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Ibesikpo Asutan",
            "lga": "Ibesikpo Asutan",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Ibiono Ibom",
            "lga": "Ibiono Ibom",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Ikono",
            "lga": "Ikono",
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Ikot Ekpene/Obot Akara",
            "lga": [
                "Ikot Ekpene",
                "Obot Akara"
            ],
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Ini",
            "lga": "Ini",
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Itu",
            "lga": "Itu",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Mbo",
            "lga": "Mbo",
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Mkpat Enin",
            "lga": "Mkpat Enin",
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Nsit Atai",
            "lga": "Nsit Atai",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Nsit Ibom",
            "lga": "Nsit Ibom",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Nsit Ubium",
            "lga": "Nsit Ubium",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Okobo",
            "lga": "Okobo",
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Onna",
            "lga": "Onna",
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Oron/Udung Uko",
            "lga": [
                "Oron",
                "Udung Uko"
            ],
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Oruko-Anam",
            "lga": "Oruko-Anam",
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Ukanafun",
            "lga": "Ukanafun",
            "sen_district": "Akwa Ibom North West"
        },
        {
            "district": "Uruan",
            "lga": "Uruan",
            "sen_district": "Akwa Ibom North East"
        },
        {
            "district": "Urue Offong/Oruko",
            "lga": [
                "Urue Offong",
                "Oruko"
            ],
            "sen_district": "Akwa Ibom South"
        },
        {
            "district": "Uyo",
            "lga": "Uyo",
            "sen_district": "Akwa Ibom North East"
        }
    ],
    "Anambra": [
        {
            "district": "Aguata I",
            "lga": "Aguata I",
            "sen_district": "Anambra South"
        },
        {
            "district": "Aguata II",
            "lga": "Aguata II",
            "sen_district": "Anambra South"
        },
        {
            "district": "Anambra East",
            "lga": "Anambra East",
            "sen_district": "Anambra North"
        },
        {
            "district": "Anambra West",
            "lga": "Anambra West",
            "sen_district": "Anambra North"
        },
        {
            "district": "Anaocha I",
            "lga": "Anaocha I",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Anaocha II",
            "lga": "Anaocha II",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Awka North",
            "lga": "Awka North",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Awka South I",
            "lga": "Awka South I",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Awka South II",
            "lga": "Awka South II",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Ayamelum",
            "lga": "Ayamelum",
            "sen_district": "Anambra North"
        },
        {
            "district": "Dunukofia",
            "lga": "Dunukofia",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Ekwusigo",
            "lga": "Ekwusigo",
            "sen_district": "Anambra South"
        },
        {
            "district": "Idemili North",
            "lga": "Idemili North",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Idemili South",
            "lga": "Idemili South",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Ihiala I",
            "lga": "Ihiala I",
            "sen_district": "Anambra South"
        },
        {
            "district": "Ihiala II",
            "lga": "Ihiala II",
            "sen_district": "Anambra South"
        },
        {
            "district": "Njikoka",
            "lga": "Njikoka",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Njikoka II",
            "lga": "Njikoka II",
            "sen_district": "Anambra Central"
        },
        {
            "district": "Nnewi North",
            "lga": "Nnewi North",
            "sen_district": "Anambra South"
        },
        {
            "district": "Nnewi South I",
            "lga": "Nnewi South I",
            "sen_district": "Anambra South"
        },
        {
            "district": "Nnewi South II",
            "lga": "Nnewi South II",
            "sen_district": "Anambra South"
        },
        {
            "district": "Ogbaru I",
            "lga": "Ogbaru I",
            "sen_district": "Anambra North"
        },
        {
            "district": "Ogbaru II",
            "lga": "Ogbaru II",
            "sen_district": "Anambra North"
        },
        {
            "district": "Onitsha North I",
            "lga": "Onitsha North I",
            "sen_district": "Anambra North"
        },
        {
            "district": "Onitsha North II",
            "lga": "Onitsha North II",
            "sen_district": "Anambra North"
        },
        {
            "district": "Onitsha South I",
            "lga": "Onitsha South I",
            "sen_district": "Anambra North"
        },
        {
            "district": "Onitsha South II",
            "lga": "Onitsha South II",
            "sen_district": "Anambra North"
        },
        {
            "district": "Orumba North",
            "lga": "Orumba North",
            "sen_district": "Anambra South"
        },
        {
            "district": "Orumba South",
            "lga": "Orumba South",
            "sen_district": "Anambra South"
        },
        {
            "district": "Oyi",
            "lga": "Oyi",
            "sen_district": "Anambra North"
        }
    ],
    "Bauchi": [
        {
            "district": "Azare",
            "lga": "Azare",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Bogoro",
            "lga": "Bogoro",
            "sen_district": "Bauchi South"
        },
        {
            "district": "Burra",
            "lga": "Burra",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Chiroma",
            "lga": "Chiroma",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Dambam/Dagauda/Jalam",
            "lga": [
                "Dambam",
                "Dagauda",
                "Jalam"
            ],
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Darazo",
            "lga": "Darazo",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Dass",
            "lga": "Dass",
            "sen_district": "Bauchi South"
        },
        {
            "district": "Duguri/Gwana",
            "lga": [
                "Duguri",
                "Gwana"
            ],
            "sen_district": "Bauchi South"
        },
        {
            "district": "Gamawa",
            "lga": "Gamawa",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Ganjuwa East",
            "lga": "Ganjuwa East",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Ganjuwa West",
            "lga": "Ganjuwa West",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Giade",
            "lga": "Giade",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Hardawa",
            "lga": "Hardawa",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Itas/Gadau",
            "lga": [
                "Itas",
                "Gadau"
            ],
            "sen_district": "Bauchi North"
        },
        {
            "district": "Jama’A/Toro",
            "lga": [
                "Jama’A",
                "Toro"
            ],
            "sen_district": "Bauchi South"
        },
        {
            "district": "Jama’Are",
            "lga": "Jama’Are",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Katagum",
            "lga": "Katagum",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Kirfi",
            "lga": "Kirfi",
            "sen_district": "Bauchi South"
        },
        {
            "district": "Lame",
            "lga": "Lame",
            "sen_district": "Bauchi South"
        },
        {
            "district": "Lere/Bula",
            "lga": [
                "Lere",
                "Bula"
            ],
            "sen_district": "Bauchi South"
        },
        {
            "district": "Madara/Chinade",
            "lga": [
                "Madara",
                "Chinade"
            ],
            "sen_district": "Bauchi North"
        },
        {
            "district": "Ningi",
            "lga": "Ningi",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Pali",
            "lga": "Pali",
            "sen_district": "Bauchi South"
        },
        {
            "district": "Sade",
            "lga": "Sade",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Sakwa",
            "lga": "Sakwa",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Shira I",
            "lga": "Shira I",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Shira II",
            "lga": "Shira II",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Udubo",
            "lga": "Udubo",
            "sen_district": "Bauchi North"
        },
        {
            "district": "Warji",
            "lga": "Warji",
            "sen_district": "Bauchi Central"
        },
        {
            "district": "Zungur/Galambi",
            "lga": [
                "Zungur",
                "Galambi"
            ],
            "sen_district": "Bauchi South"
        }
    ],
    "Bayelsa": [
        {
            "district": "Brass I",
            "lga": "Brass I",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Brass II",
            "lga": "Brass II",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Brass III",
            "lga": "Brass III",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Ekeremor I",
            "lga": "Ekeremor I",
            "sen_district": "Bayelsa West"
        },
        {
            "district": "Ekeremor II",
            "lga": "Ekeremor II",
            "sen_district": "Bayelsa West"
        },
        {
            "district": "Ekeremor III",
            "lga": "Ekeremor III",
            "sen_district": "Bayelsa West"
        },
        {
            "district": "Kolokuma/Opokuma I",
            "lga": [
                "Kolokuma",
                "Opokuma I"
            ],
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Kolokuma/Opokuma II",
            "lga": [
                "Kolokuma",
                "Opokuma II"
            ],
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Nembe I",
            "lga": "Nembe I",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Nembe II",
            "lga": "Nembe II",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Nembe III",
            "lga": "Nembe III",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Ogbia I",
            "lga": "Ogbia I",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Ogbia II",
            "lga": "Ogbia II",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Ogbia III",
            "lga": "Ogbia III",
            "sen_district": "Bayelsa East"
        },
        {
            "district": "Sagbama I",
            "lga": "Sagbama I",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Sagbama II",
            "lga": "Sagbama II",
            "sen_district": "Bayelsa West"
        },
        {
            "district": "Sagbama III",
            "lga": "Sagbama III",
            "sen_district": "Bayelsa West"
        },
        {
            "district": "Southern Ijaw I",
            "lga": "Southern Ijaw I",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Southern Ijaw II",
            "lga": "Southern Ijaw II",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Southern Ijaw III",
            "lga": "Southern Ijaw III",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Southern Ijaw IV",
            "lga": "Southern Ijaw IV",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Yenagoa I",
            "lga": "Yenagoa I",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Yenagoa II",
            "lga": "Yenagoa II",
            "sen_district": "Bayelsa Central"
        },
        {
            "district": "Yenagoa III",
            "lga": "Yenagoa III",
            "sen_district": "Bayelsa Central"
        }
    ],
    "Benue": [
        {
            "district": "Ado",
            "lga": "Ado",
            "sen_district": "Benue South"
        },
        {
            "district": "Adoka/Ugboju",
            "lga": [
                "Adoka",
                "Ugboju"
            ],
            "sen_district": "Benue South"
        },
        {
            "district": "Agbatu",
            "lga": "Agbatu",
            "sen_district": "Benue South"
        },
        {
            "district": "Apa",
            "lga": "Apa",
            "sen_district": "Benue South"
        },
        {
            "district": "Buruku",
            "lga": "Buruku",
            "sen_district": "Benue North West"
        },
        {
            "district": "Gboko I",
            "lga": "Gboko I",
            "sen_district": "Benue North West"
        },
        {
            "district": "Gboko West",
            "lga": "Gboko West",
            "sen_district": "Benue North West"
        },
        {
            "district": "Guma",
            "lga": "Guma",
            "sen_district": "Benue North West"
        },
        {
            "district": "Gwer East",
            "lga": "Gwer East",
            "sen_district": "Benue North West"
        },
        {
            "district": "Gwer West",
            "lga": "Gwer West",
            "sen_district": "Benue North West"
        },
        {
            "district": "Katsina Ala East",
            "lga": "Katsina Ala East",
            "sen_district": "Benue North East"
        },
        {
            "district": "Katsina-Ala West",
            "lga": "Katsina-Ala West",
            "sen_district": "Benue North East"
        },
        {
            "district": "Konshisha I",
            "lga": "Konshisha I",
            "sen_district": "Benue North East"
        },
        {
            "district": "Kwande East",
            "lga": "Kwande East",
            "sen_district": "Benue North East"
        },
        {
            "district": "Kwande West",
            "lga": "Kwande West",
            "sen_district": "Benue North East"
        },
        {
            "district": "Logo",
            "lga": "Logo",
            "sen_district": "Benue North East"
        },
        {
            "district": "Makurdi I",
            "lga": "Makurdi I",
            "sen_district": "Benue North West"
        },
        {
            "district": "Makurdi South",
            "lga": "Makurdi South",
            "sen_district": "Benue North West"
        },
        {
            "district": "Obi",
            "lga": "Obi",
            "sen_district": "Benue South"
        },
        {
            "district": "Ogbadibo",
            "lga": "Ogbadibo",
            "sen_district": "Benue South"
        },
        {
            "district": "Ohimini",
            "lga": "Ohimini",
            "sen_district": "Benue South"
        },
        {
            "district": "Oju I",
            "lga": "Oju I",
            "sen_district": "Benue South"
        },
        {
            "district": "Oju II",
            "lga": "Oju II",
            "sen_district": "Benue South"
        },
        {
            "district": "Okpokwu",
            "lga": "Okpokwu",
            "sen_district": "Benue South"
        },
        {
            "district": "Otukpo/Akpa",
            "lga": [
                "Otukpo",
                "Akpa"
            ],
            "sen_district": "Benue South"
        },
        {
            "district": "Tarka",
            "lga": "Tarka",
            "sen_district": "Benue North West"
        },
        {
            "district": "Ukum I",
            "lga": "Ukum I",
            "sen_district": "Benue North East"
        },
        {
            "district": "Ushongo",
            "lga": "Ushongo",
            "sen_district": "Benue North East"
        },
        {
            "district": "Vandeikya I",
            "lga": "Vandeikya I",
            "sen_district": "Benue North East"
        },
        {
            "district": "Vandeikya II",
            "lga": "Vandeikya II",
            "sen_district": "Benue North East"
        }
    ],
    "Borno": [
        {
            "district": "Abadam",
            "lga": "Abadam",
            "sen_district": "Borno North"
        },
        {
            "district": "Askira",
            "lga": "Askira",
            "sen_district": "Borno South"
        },
        {
            "district": "Bama I",
            "lga": "Bama I",
            "sen_district": "Borno Central"
        },
        {
            "district": "Bama II",
            "lga": "Bama II",
            "sen_district": "Borno Central"
        },
        {
            "district": "Bayo",
            "lga": "Bayo",
            "sen_district": "Borno South"
        },
        {
            "district": "Biu",
            "lga": "Biu",
            "sen_district": "Borno South"
        },
        {
            "district": "Chibok",
            "lga": "Chibok",
            "sen_district": "Borno South"
        },
        {
            "district": "Damaboa",
            "lga": "Damaboa",
            "sen_district": "Borno South"
        },
        {
            "district": "Dikwa",
            "lga": "Dikwa",
            "sen_district": "Borno Central"
        },
        {
            "district": "Gubio",
            "lga": "Gubio",
            "sen_district": "Borno North"
        },
        {
            "district": "Guzamala",
            "lga": "Guzamala",
            "sen_district": "Borno North"
        },
        {
            "district": "Gwoza",
            "lga": "Gwoza",
            "sen_district": "Borno South"
        },
        {
            "district": "Hawul",
            "lga": "Hawul",
            "sen_district": "Borno South"
        },
        {
            "district": "Jere",
            "lga": "Jere",
            "sen_district": "Borno Central"
        },
        {
            "district": "Kaga",
            "lga": "Kaga",
            "sen_district": "Borno North"
        },
        {
            "district": "Kala/Balge",
            "lga": [
                "Kala",
                "Balge"
            ],
            "sen_district": "Borno Central"
        },
        {
            "district": "Konduga",
            "lga": "Konduga",
            "sen_district": "Borno Central"
        },
        {
            "district": "Kukawa",
            "lga": "Kukawa",
            "sen_district": "Borno North"
        },
        {
            "district": "Kwaya Kusar",
            "lga": "Kwaya Kusar",
            "sen_district": "Borno South"
        },
        {
            "district": "Mafa",
            "lga": "Mafa",
            "sen_district": "Borno Central"
        },
        {
            "district": "Magumeri",
            "lga": "Magumeri",
            "sen_district": "Borno North"
        },
        {
            "district": "Maiduguri M.C",
            "lga": "Maiduguri M.C",
            "sen_district": "Borno Central"
        },
        {
            "district": "Marte",
            "lga": "Marte",
            "sen_district": "Borno North"
        },
        {
            "district": "Mobbar",
            "lga": "Mobbar",
            "sen_district": "Borno North"
        },
        {
            "district": "Monguno",
            "lga": "Monguno",
            "sen_district": "Borno North"
        },
        {
            "district": "Ngala",
            "lga": "Ngala",
            "sen_district": "Borno Central"
        },
        {
            "district": "Nganzai",
            "lga": "Nganzai",
            "sen_district": "Borno North"
        },
        {
            "district": "Shani",
            "lga": "Shani",
            "sen_district": "Borno South"
        }
    ],
    "Cross River": [
        {
            "district": "Abi",
            "lga": "Abi",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Akamkpa I",
            "lga": "Akamkpa I",
            "sen_district": "Cross River South"
        },
        {
            "district": "Akamkpa II",
            "lga": "Akamkpa II",
            "sen_district": "Cross River South"
        },
        {
            "district": "Akpabuyo",
            "lga": "Akpabuyo",
            "sen_district": "Cross River South"
        },
        {
            "district": "Bakassi",
            "lga": "Bakassi",
            "sen_district": "Cross River South"
        },
        {
            "district": "Bekwarra",
            "lga": "Bekwarra",
            "sen_district": "Cross River North"
        },
        {
            "district": "Biase",
            "lga": "Biase",
            "sen_district": "Cross River South"
        },
        {
            "district": "Boki I",
            "lga": "Boki I",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Boki II",
            "lga": "Boki II",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Calabar Municipal",
            "lga": "Calabar Municipal",
            "sen_district": "Cross River South"
        },
        {
            "district": "Calabar South I",
            "lga": "Calabar South I",
            "sen_district": "Cross River South"
        },
        {
            "district": "Calabar South II",
            "lga": "Calabar South II",
            "sen_district": "Cross River South"
        },
        {
            "district": "Etung",
            "lga": "Etung",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Ikom I",
            "lga": "Ikom I",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Ikom II",
            "lga": "Ikom II",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Obanleku",
            "lga": "Obanleku",
            "sen_district": "Cross River North"
        },
        {
            "district": "Obubra I",
            "lga": "Obubra I",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Obubra II",
            "lga": "Obubra II",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Obudu",
            "lga": "Obudu",
            "sen_district": "Cross River North"
        },
        {
            "district": "Odukpani",
            "lga": "Odukpani",
            "sen_district": "Cross River South"
        },
        {
            "district": "Ogoja",
            "lga": "Ogoja",
            "sen_district": "Cross River North"
        },
        {
            "district": "Yakurr I",
            "lga": "Yakurr I",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Yakurr II",
            "lga": "Yakurr II",
            "sen_district": "Cross River Central"
        },
        {
            "district": "Yala I",
            "lga": "Yala I",
            "sen_district": "Cross River North"
        },
        {
            "district": "Yala II",
            "lga": "Yala II",
            "sen_district": "Cross River North"
        }
    ],
    "Delta": [
        {
            "district": "Aniocha North",
            "lga": "Aniocha North",
            "sen_district": "Delta North"
        },
        {
            "district": "Aniocha South",
            "lga": "Aniocha South",
            "sen_district": "Delta North"
        },
        {
            "district": "Bomadi",
            "lga": "Bomadi",
            "sen_district": "Delta South"
        },
        {
            "district": "Burutu",
            "lga": "Burutu",
            "sen_district": "Delta South"
        },
        {
            "district": "Burutu North",
            "lga": "Burutu North",
            "sen_district": "Delta South"
        },
        {
            "district": "Ethiope East",
            "lga": "Ethiope East",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ethiope West",
            "lga": "Ethiope West",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ika North East",
            "lga": "Ika North East",
            "sen_district": "Delta North"
        },
        {
            "district": "Ika South",
            "lga": "Ika South",
            "sen_district": "Delta North"
        },
        {
            "district": "Isoko South I",
            "lga": "Isoko South I",
            "sen_district": "Delta South"
        },
        {
            "district": "Isoko South II",
            "lga": "Isoko South II",
            "sen_district": "Delta South"
        },
        {
            "district": "Ndokwa East",
            "lga": "Ndokwa East",
            "sen_district": "Delta North"
        },
        {
            "district": "Ndokwa West",
            "lga": "Ndokwa West",
            "sen_district": "Delta North"
        },
        {
            "district": "Okpe",
            "lga": "Okpe",
            "sen_district": "Delta Central"
        },
        {
            "district": "Oshimili North",
            "lga": "Oshimili North",
            "sen_district": "Delta North"
        },
        {
            "district": "Oshimili South",
            "lga": "Oshimili South",
            "sen_district": "Delta North"
        },
        {
            "district": "Patani",
            "lga": "Patani",
            "sen_district": "Delta South"
        },
        {
            "district": "Sapele",
            "lga": "Sapele",
            "sen_district": "Delta Central"
        },
        {
            "district": "Udu",
            "lga": "Udu",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ughelli North I",
            "lga": "Ughelli North I",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ughelli North II",
            "lga": "Ughelli North II",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ughelli South",
            "lga": "Ughelli South",
            "sen_district": "Delta Central"
        },
        {
            "district": "Ukwuani",
            "lga": "Ukwuani",
            "sen_district": "Delta North"
        },
        {
            "district": "Uvwie",
            "lga": "Uvwie",
            "sen_district": "Delta Central"
        },
        {
            "district": "Warri North",
            "lga": "Warri North",
            "sen_district": "Delta South"
        },
        {
            "district": "Warri South I",
            "lga": "Warri South I",
            "sen_district": "Delta South"
        },
        {
            "district": "Warri South II",
            "lga": "Warri South II",
            "sen_district": "Delta South"
        },
        {
            "district": "Warri South-West",
            "lga": "Warri South-West",
            "sen_district": "Delta South"
        }
    ],
    "Ebonyi": [
        {
            "district": "Abakaliki North",
            "lga": "Abakaliki North",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Abakaliki South",
            "lga": "Abakaliki South",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Afikpo North East",
            "lga": "Afikpo North East",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Afikpo North West",
            "lga": "Afikpo North West",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Afikpo South East",
            "lga": "Afikpo South East",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Afikpo South West",
            "lga": "Afikpo South West",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Ebonyi North East",
            "lga": "Ebonyi North East",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Ebonyi North West",
            "lga": "Ebonyi North West",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Ezza North East",
            "lga": "Ezza North East",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ezza North West",
            "lga": "Ezza North West",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ezza South",
            "lga": "Ezza South",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ikwo North",
            "lga": "Ikwo North",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ikwo South",
            "lga": "Ikwo South",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ishielu North",
            "lga": "Ishielu North",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ishielu South",
            "lga": "Ishielu South",
            "sen_district": "Ebonyi South"
        },
        {
            "district": "Ivo",
            "lga": "Ivo",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Izzi East",
            "lga": "Izzi East",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Izzi West",
            "lga": "Izzi West",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Ohaozara East",
            "lga": "Ohaozara East",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Ohaozara West",
            "lga": "Ohaozara West",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Ohaukwu North",
            "lga": "Ohaukwu North",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Ohaukwu South",
            "lga": "Ohaukwu South",
            "sen_district": "Ebonyi North"
        },
        {
            "district": "Onicha East",
            "lga": "Onicha East",
            "sen_district": "Ebonyi Central"
        },
        {
            "district": "Onicha West",
            "lga": "Onicha West",
            "sen_district": "Ebonyi Central"
        }
    ],
    "Edo": [
        {
            "district": "Akoko Edo I",
            "lga": "Akoko Edo I",
            "sen_district": "Edo North"
        },
        {
            "district": "Akoko Edo II",
            "lga": "Akoko Edo II",
            "sen_district": "Edo North"
        },
        {
            "district": "Egor",
            "lga": "Egor",
            "sen_district": "Edo South"
        },
        {
            "district": "Esan Central",
            "lga": "Esan Central",
            "sen_district": "Edo Central"
        },
        {
            "district": "Esan North East I",
            "lga": "Esan North East I",
            "sen_district": "Edo Central"
        },
        {
            "district": "Esan North East II",
            "lga": "Esan North East II",
            "sen_district": "Edo Central"
        },
        {
            "district": "Esan South East",
            "lga": "Esan South East",
            "sen_district": "Edo Central"
        },
        {
            "district": "Esan West",
            "lga": "Esan West",
            "sen_district": "Edo Central"
        },
        {
            "district": "Etsako Central",
            "lga": "Etsako Central",
            "sen_district": "Edo North"
        },
        {
            "district": "Etsako East",
            "lga": "Etsako East",
            "sen_district": "Edo North"
        },
        {
            "district": "Etsako West I",
            "lga": "Etsako West I",
            "sen_district": "Edo North"
        },
        {
            "district": "Etsako West II",
            "lga": "Etsako West II",
            "sen_district": "Edo North"
        },
        {
            "district": "Igueben",
            "lga": "Igueben",
            "sen_district": "Edo Central"
        },
        {
            "district": "Ikpoba - Okha",
            "lga": "Ikpoba - Okha",
            "sen_district": "Edo South"
        },
        {
            "district": "Oredo East",
            "lga": "Oredo East",
            "sen_district": "Edo South"
        },
        {
            "district": "Oredo West",
            "lga": "Oredo West",
            "sen_district": "Edo South"
        },
        {
            "district": "Orhionmwon I",
            "lga": "Orhionmwon I",
            "sen_district": "Edo South"
        },
        {
            "district": "Orhionmwon II",
            "lga": "Orhionmwon II",
            "sen_district": "Edo South"
        },
        {
            "district": "Ovia North East I",
            "lga": "Ovia North East I",
            "sen_district": "Edo South"
        },
        {
            "district": "Ovia North East II",
            "lga": "Ovia North East II",
            "sen_district": "Edo South"
        },
        {
            "district": "Ovia South West",
            "lga": "Ovia South West",
            "sen_district": "Edo South"
        },
        {
            "district": "Owan East",
            "lga": "Owan East",
            "sen_district": "Edo North"
        },
        {
            "district": "Owan West",
            "lga": "Owan West",
            "sen_district": "Edo North"
        },
        {
            "district": "Uhunmwode",
            "lga": "Uhunmwode",
            "sen_district": "Edo South"
        }
    ],
    "Ekiti": [
        {
            "district": "Ado I",
            "lga": "Ado I",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Ado II",
            "lga": "Ado II",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Efon",
            "lga": "Efon",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Ekiti East I",
            "lga": "Ekiti East I",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ekiti East II",
            "lga": "Ekiti East II",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ekiti South West I",
            "lga": "Ekiti South West I",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ekiti South West II",
            "lga": "Ekiti South West II",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ekiti West I",
            "lga": "Ekiti West I",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Ekiti West II",
            "lga": "Ekiti West II",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Emure",
            "lga": "Emure",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Gbonyin",
            "lga": "Gbonyin",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ido Osi I",
            "lga": "Ido Osi I",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Ido/Osi II",
            "lga": [
                "Ido",
                "Osi II"
            ],
            "sen_district": "Ekiti North"
        },
        {
            "district": "Ijero",
            "lga": "Ijero",
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Ikere I",
            "lga": "Ikere I",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ikere II",
            "lga": "Ikere II",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Ikole I",
            "lga": "Ikole I",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Ikole II",
            "lga": "Ikole II",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Ilejemeje",
            "lga": "Ilejemeje",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Irepodun/Ifelodun I",
            "lga": [
                "Irepodun",
                "Ifelodun I"
            ],
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Irepodun/Ifelodun II",
            "lga": [
                "Irepodun",
                "Ifelodun II"
            ],
            "sen_district": "Ekiti Central"
        },
        {
            "district": "Ise-Orun",
            "lga": "Ise-Orun",
            "sen_district": "Ekiti South"
        },
        {
            "district": "Moba I",
            "lga": "Moba I",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Moba II",
            "lga": "Moba II",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Oye I",
            "lga": "Oye I",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Oye II",
            "lga": "Oye II",
            "sen_district": "Ekiti North"
        },
        {
            "district": "Essa/Shawo/Igboidun",
            "lga": [
                "Essa",
                "Shawo",
                "Igboidun"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Ilesha Gwanara",
            "lga": "Ilesha Gwanara",
            "sen_district": "Kwara North"
        },
        {
            "district": "Ilorin Central",
            "lga": "Ilorin Central",
            "sen_district": "Kwara Central"
        },
        {
            "district": "Ilorin East",
            "lga": "Ilorin East",
            "sen_district": "Kwara Central"
        },
        {
            "district": "Ilorin South",
            "lga": "Ilorin South",
            "sen_district": "Kwara Central"
        },
        {
            "district": "Ipaye/Malete/Olooru",
            "lga": [
                "Ipaye",
                "Malete",
                "Olooru"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Irepodun",
            "lga": "Irepodun",
            "sen_district": "Kwara South"
        },
        {
            "district": "Isin",
            "lga": "Isin",
            "sen_district": "Kwara South"
        },
        {
            "district": "Kaiama/Wajibe",
            "lga": [
                "Kaiama",
                "Wajibe"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Lafiagi-Edu",
            "lga": "Lafiagi-Edu",
            "sen_district": "Kwara North"
        },
        {
            "district": "Lanwa/ Ejidongari",
            "lga": [
                "Lanwa",
                "Ejidongari"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Odo-Ogun",
            "lga": "Odo-Ogun",
            "sen_district": "Kwara South"
        },
        {
            "district": "Oke Ogun",
            "lga": "Oke Ogun",
            "sen_district": "Kwara South"
        },
        {
            "district": "Oke-Ero",
            "lga": "Oke-Ero",
            "sen_district": "Kwara South"
        },
        {
            "district": "Okuta/Yashikira",
            "lga": [
                "Okuta",
                "Yashikira"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Omupo/Igbaja",
            "lga": [
                "Omupo",
                "Igbaja"
            ],
            "sen_district": "Kwara South"
        },
        {
            "district": "Owode/Onire",
            "lga": [
                "Owode",
                "Onire"
            ],
            "sen_district": "Kwara Central"
        },
        {
            "district": "Patigi",
            "lga": "Patigi",
            "sen_district": "Kwara North"
        },
        {
            "district": "Share/Oke-Ode",
            "lga": [
                "Share",
                "Oke-Ode"
            ],
            "sen_district": "Kwara South"
        }
    ],
    "Enugu": [
        {
            "district": "Aninri",
            "lga": "Aninri",
            "sen_district": "Enugu West"
        },
        {
            "district": "Awgu North",
            "lga": "Awgu North",
            "sen_district": "Enugu West"
        },
        {
            "district": "Awgu South",
            "lga": "Awgu South",
            "sen_district": "Enugu West"
        },
        {
            "district": "Enugu East Urban",
            "lga": "Enugu East Urban",
            "sen_district": "Enugu East"
        },
        {
            "district": "Enugu North",
            "lga": "Enugu North",
            "sen_district": "Enugu East"
        },
        {
            "district": "Enugu South Rural",
            "lga": "Enugu South Rural",
            "sen_district": "Enugu East"
        },
        {
            "district": "Enugu South Urban",
            "lga": "Enugu South Urban",
            "sen_district": "Enugu East"
        },
        {
            "district": "Enugwu East Rural",
            "lga": "Enugwu East Rural",
            "sen_district": "Enugu East"
        },
        {
            "district": "Ezeagu",
            "lga": "Ezeagu",
            "sen_district": "Enugu West"
        },
        {
            "district": "Igboetiti East",
            "lga": "Igboetiti East",
            "sen_district": "Enugu North"
        },
        {
            "district": "Igboetiti West",
            "lga": "Igboetiti West",
            "sen_district": "Enugu North"
        },
        {
            "district": "Igboeze North I",
            "lga": "Igboeze North I",
            "sen_district": "Enugu North"
        },
        {
            "district": "Igboeze North II",
            "lga": "Igboeze North II",
            "sen_district": "Enugu North"
        },
        {
            "district": "Igboeze South",
            "lga": "Igboeze South",
            "sen_district": "Enugu North"
        },
        {
            "district": "Isi Uzo",
            "lga": "Isi Uzo",
            "sen_district": "Enugu East"
        },
        {
            "district": "Nkanu East",
            "lga": "Nkanu East",
            "sen_district": "Enugu East"
        },
        {
            "district": "Nkanu West",
            "lga": "Nkanu West",
            "sen_district": "Enugu East"
        },
        {
            "district": "Nsukka East",
            "lga": "Nsukka East",
            "sen_district": "Enugu North"
        },
        {
            "district": "Nsukka West",
            "lga": "Nsukka West",
            "sen_district": "Enugu North"
        },
        {
            "district": "Oji River",
            "lga": "Oji River",
            "sen_district": "Enugu West"
        },
        {
            "district": "Udenu",
            "lga": "Udenu",
            "sen_district": "Enugu North"
        },
        {
            "district": "Udi North",
            "lga": "Udi North",
            "sen_district": "Enugu West"
        },
        {
            "district": "Udi South",
            "lga": "Udi South",
            "sen_district": "Enugu West"
        },
        {
            "district": "Uzo Uwani",
            "lga": "Uzo Uwani",
            "sen_district": "Enugu North"
        }
    ],
    "Gombe": [
        {
            "district": "Akko Central",
            "lga": "Akko Central",
            "sen_district": "Gombe Central"
        },
        {
            "district": "Akko North",
            "lga": "Akko North",
            "sen_district": "Gombe Central"
        },
        {
            "district": "Akko West",
            "lga": "Akko West",
            "sen_district": "Gombe Central"
        },
        {
            "district": "Balanga North",
            "lga": "Balanga North",
            "sen_district": "Gombe South"
        },
        {
            "district": "Balanga South",
            "lga": "Balanga South",
            "sen_district": "Gombe South"
        },
        {
            "district": "Billiri East",
            "lga": "Billiri East",
            "sen_district": "Gombe South"
        },
        {
            "district": "Billiri West",
            "lga": "Billiri West",
            "sen_district": "Gombe South"
        },
        {
            "district": "Deba",
            "lga": "Deba",
            "sen_district": "Gombe Central"
        },
        {
            "district": "Dukku North",
            "lga": "Dukku North",
            "sen_district": "Gombe North"
        },
        {
            "district": "Dukku South",
            "lga": "Dukku South",
            "sen_district": "Gombe North"
        },
        {
            "district": "Funakaye North",
            "lga": "Funakaye North",
            "sen_district": "Gombe North"
        },
        {
            "district": "Funakaye South",
            "lga": "Funakaye South",
            "sen_district": "Gombe North"
        },
        {
            "district": "Gombe North",
            "lga": "Gombe North",
            "sen_district": "Gombe North"
        },
        {
            "district": "Gombe South",
            "lga": "Gombe South",
            "sen_district": "Gombe North"
        },
        {
            "district": "Kaltungo East",
            "lga": "Kaltungo East",
            "sen_district": "Gombe South"
        },
        {
            "district": "Kaltungo West",
            "lga": "Kaltungo West",
            "sen_district": "Gombe South"
        },
        {
            "district": "Kwami East",
            "lga": "Kwami East",
            "sen_district": "Gombe North"
        },
        {
            "district": "Kwami West",
            "lga": "Kwami West",
            "sen_district": "Gombe North"
        },
        {
            "district": "Nafada North",
            "lga": "Nafada North",
            "sen_district": "Gombe North"
        },
        {
            "district": "Nafada South",
            "lga": "Nafada South",
            "sen_district": "Gombe North"
        },
        {
            "district": "Pero Chonge",
            "lga": "Pero Chonge",
            "sen_district": "Gombe South"
        },
        {
            "district": "Shongom",
            "lga": "Shongom",
            "sen_district": "Gombe South"
        },
        {
            "district": "Yamaltu East",
            "lga": "Yamaltu East",
            "sen_district": "Gombe Central"
        },
        {
            "district": "Yamaltu West",
            "lga": "Yamaltu West",
            "sen_district": "Gombe Central"
        }
    ],
    "Imo": [
        {
            "district": "Aboh Mbaise",
            "lga": "Aboh Mbaise",
            "sen_district": "Imo East"
        },
        {
            "district": "Ahiazu Mbaise",
            "lga": "Ahiazu Mbaise",
            "sen_district": "Imo East"
        },
        {
            "district": "Ehime Mbano",
            "lga": "Ehime Mbano",
            "sen_district": "Imo North"
        },
        {
            "district": "Ezinihitte",
            "lga": "Ezinihitte",
            "sen_district": "Imo East"
        },
        {
            "district": "Ideato North",
            "lga": "Ideato North",
            "sen_district": "Imo West"
        },
        {
            "district": "Ideato South",
            "lga": "Ideato South",
            "sen_district": "Imo West"
        },
        {
            "district": "Ihite/Uboma",
            "lga": [
                "Ihite",
                "Uboma"
            ],
            "sen_district": "Imo North"
        },
        {
            "district": "Ikeduru",
            "lga": "Ikeduru",
            "sen_district": "Imo East"
        },
        {
            "district": "Isiala Mbano",
            "lga": "Isiala Mbano",
            "sen_district": "Imo North"
        },
        {
            "district": "Isu",
            "lga": "Isu",
            "sen_district": "Imo West"
        },
        {
            "district": "Mbaitoli",
            "lga": "Mbaitoli",
            "sen_district": "Imo East"
        },
        {
            "district": "Ngor Okpala",
            "lga": "Ngor Okpala",
            "sen_district": "Imo East"
        },
        {
            "district": "Njaba",
            "lga": "Njaba",
            "sen_district": "Imo West"
        },
        {
            "district": "Nkwerre",
            "lga": "Nkwerre",
            "sen_district": "Imo West"
        },
        {
            "district": "Nwangele",
            "lga": "Nwangele",
            "sen_district": "Imo West"
        },
        {
            "district": "Obowo",
            "lga": "Obowo",
            "sen_district": "Imo North"
        },
        {
            "district": "Oguta",
            "lga": "Oguta",
            "sen_district": "Imo West"
        },
        {
            "district": "Ohaji/Egbema",
            "lga": [
                "Ohaji",
                "Egbema"
            ],
            "sen_district": "Imo West"
        },
        {
            "district": "Okigwe",
            "lga": "Okigwe",
            "sen_district": "Imo North"
        },
        {
            "district": "Onuimo",
            "lga": "Onuimo",
            "sen_district": "Imo North"
        },
        {
            "district": "Orlu",
            "lga": "Orlu",
            "sen_district": "Imo West"
        },
        {
            "district": "Orsu",
            "lga": "Orsu",
            "sen_district": "Imo West"
        },
        {
            "district": "Oru East",
            "lga": "Oru East",
            "sen_district": "Imo West"
        },
        {
            "district": "Oru West",
            "lga": "Oru West",
            "sen_district": "Imo West"
        },
        {
            "district": "Owerri Municipal",
            "lga": "Owerri Municipal",
            "sen_district": "Imo East"
        },
        {
            "district": "Owerri North",
            "lga": "Owerri North",
            "sen_district": "Imo East"
        },
        {
            "district": "Owerri West",
            "lga": "Owerri West",
            "sen_district": "Imo East"
        }
    ],
    "Jigawa": [
        {
            "district": "Auyo",
            "lga": "Auyo",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Babura",
            "lga": "Babura",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Balangu",
            "lga": "Balangu",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Birnin Kudu",
            "lga": "Birnin Kudu",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Birniwa",
            "lga": "Birniwa",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Buji",
            "lga": "Buji",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Dutse",
            "lga": "Dutse",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Fagam",
            "lga": "Fagam",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Gagarawa",
            "lga": "Gagarawa",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Garki",
            "lga": "Garki",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Gumel",
            "lga": "Gumel",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Guri",
            "lga": "Guri",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Gwaram",
            "lga": "Gwaram",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Gwiwa",
            "lga": "Gwiwa",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Hadeijia",
            "lga": "Hadeijia",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Jahun",
            "lga": "Jahun",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Kafin Hausa",
            "lga": "Kafin Hausa",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Kanya",
            "lga": "Kanya",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Kaugama",
            "lga": "Kaugama",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Kazaure",
            "lga": "Kazaure",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Kiri-Kasamma",
            "lga": "Kiri-Kasamma",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Kiyawa",
            "lga": "Kiyawa",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Maigatari",
            "lga": "Maigatari",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Mallam Madori",
            "lga": "Mallam Madori",
            "sen_district": "Jigawa North East"
        },
        {
            "district": "Miga",
            "lga": "Miga",
            "sen_district": "Jigawa South West"
        },
        {
            "district": "Ringim",
            "lga": "Ringim",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Roni",
            "lga": "Roni",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Sule-Tankarkar",
            "lga": "Sule-Tankarkar",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Taura",
            "lga": "Taura",
            "sen_district": "Jigawa North West"
        },
        {
            "district": "Yankwashi",
            "lga": "Yankwashi",
            "sen_district": "Jigawa North West"
        }
    ],
    "Kaduna": [
        {
            "district": "Basawa",
            "lga": "Basawa",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Chawai/Kauru",
            "lga": [
                "Chawai",
                "Kauru"
            ],
            "sen_district": "Kaduna South"
        },
        {
            "district": "Chikun I",
            "lga": "Chikun I",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Doka/Gabasawa",
            "lga": [
                "Doka",
                "Gabasawa"
            ],
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Giwa East",
            "lga": "Giwa East",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Giwa West",
            "lga": "Giwa West",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Igabi East",
            "lga": "Igabi East",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Igabi West",
            "lga": "Igabi West",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Ikara",
            "lga": "Ikara",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Jaba",
            "lga": "Jaba",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Jema’A",
            "lga": "Jema’A",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Kachia",
            "lga": "Kachia",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Kagarko",
            "lga": "Kagarko",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Kajuru",
            "lga": "Kajuru",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Kakangi",
            "lga": "Kakangi",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Kaura",
            "lga": "Kaura",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Kawo",
            "lga": "Kawo",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Kubau",
            "lga": "Kubau",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Kudan",
            "lga": "Kudan",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Lere West",
            "lga": "Lere West",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Magajin Gari",
            "lga": "Magajin Gari",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Maigana",
            "lga": "Maigana",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Makarfi",
            "lga": "Makarfi",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Makera",
            "lga": "Makera",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Sabon Gari",
            "lga": "Sabon Gari",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Saminaka",
            "lga": "Saminaka",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Sanga",
            "lga": "Sanga",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Soba",
            "lga": "Soba",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Tudun Wada",
            "lga": "Tudun Wada",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Unguwar Sanusi",
            "lga": "Unguwar Sanusi",
            "sen_district": "Kaduna Central"
        },
        {
            "district": "Zangon Kataf",
            "lga": "Zangon Kataf",
            "sen_district": "Kaduna South"
        },
        {
            "district": "Zaria City",
            "lga": "Zaria City",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Zaria Kewaye",
            "lga": "Zaria Kewaye",
            "sen_district": "Kaduna North"
        },
        {
            "district": "Zonkwa",
            "lga": "Zonkwa",
            "sen_district": "Kaduna South"
        }
    ],
    "Kano": [
        {
            "district": "Ajingi",
            "lga": "Ajingi",
            "sen_district": "Kano South"
        },
        {
            "district": "Albasu",
            "lga": "Albasu",
            "sen_district": "Kano South"
        },
        {
            "district": "Bebeji",
            "lga": "Bebeji",
            "sen_district": "Kano South"
        },
        {
            "district": "Bichi",
            "lga": "Bichi",
            "sen_district": "Kano North"
        },
        {
            "district": "Bunkure",
            "lga": "Bunkure",
            "sen_district": "Kano South"
        },
        {
            "district": "D/Kudu",
            "lga": [
                "D",
                "Kudu"
            ],
            "sen_district": "Kano Central"
        },
        {
            "district": "D/Tofa",
            "lga": [
                "D",
                "Tofa"
            ],
            "sen_district": "Kano North"
        },
        {
            "district": "Dala",
            "lga": "Dala",
            "sen_district": "Kano Central"
        },
        {
            "district": "Dambatta",
            "lga": "Dambatta",
            "sen_district": "Kano North"
        },
        {
            "district": "Doguwa",
            "lga": "Doguwa",
            "sen_district": "Kano South"
        },
        {
            "district": "Fagge",
            "lga": "Fagge",
            "sen_district": "Kano Central"
        },
        {
            "district": "Gabasawa",
            "lga": "Gabasawa",
            "sen_district": "Kano North"
        },
        {
            "district": "Garko",
            "lga": "Garko",
            "sen_district": "Kano South"
        },
        {
            "district": "Gaya",
            "lga": "Gaya",
            "sen_district": "Kano South"
        },
        {
            "district": "Gezawa",
            "lga": "Gezawa",
            "sen_district": "Kano Central"
        },
        {
            "district": "Gwale",
            "lga": "Gwale",
            "sen_district": "Kano Central"
        },
        {
            "district": "Gwarzo",
            "lga": "Gwarzo",
            "sen_district": "Kano North"
        },
        {
            "district": "Kabo",
            "lga": "Kabo",
            "sen_district": "Kano North"
        },
        {
            "district": "Karaye",
            "lga": "Karaye",
            "sen_district": "Kano South"
        },
        {
            "district": "Kibiya",
            "lga": "Kibiya",
            "sen_district": "Kano South"
        },
        {
            "district": "Kiru",
            "lga": "Kiru",
            "sen_district": "Kano South"
        },
        {
            "district": "Kumbotso",
            "lga": "Kumbotso",
            "sen_district": "Kano Central"
        },
        {
            "district": "Kunchi/Tsanyawa",
            "lga": [
                "Kunchi",
                "Tsanyawa"
            ],
            "sen_district": "Kano North"
        },
        {
            "district": "Kura/G/Mallam",
            "lga": [
                "Kura",
                "G",
                "Mallam"
            ],
            "sen_district": "Kano Central"
        },
        {
            "district": "Madobi",
            "lga": "Madobi",
            "sen_district": "Kano Central"
        },
        {
            "district": "Makoda",
            "lga": "Makoda",
            "sen_district": "Kano North"
        },
        {
            "district": "Minjibir",
            "lga": "Minjibir",
            "sen_district": "Kano Central"
        },
        {
            "district": "Municipal",
            "lga": "Municipal",
            "sen_district": "Kano Central"
        }
    ],
    "Nasarawa": [
        {
            "district": "Rano",
            "lga": "Rano",
            "sen_district": "Kano South"
        },
        {
            "district": "Rimin Gado/Tofa",
            "lga": [
                "Rimin Gado",
                "Tofa"
            ],
            "sen_district": "Kano North"
        },
        {
            "district": "Rogo",
            "lga": "Rogo",
            "sen_district": "Kano South"
        },
        {
            "district": "Shanono",
            "lga": "Shanono",
            "sen_district": "Kano North"
        },
        {
            "district": "Sumaila",
            "lga": "Sumaila",
            "sen_district": "Kano South"
        },
        {
            "district": "T/Wada",
            "lga": [
                "T",
                "Wada"
            ],
            "sen_district": "Kano South"
        },
        {
            "district": "Takai",
            "lga": "Takai",
            "sen_district": "Kano South"
        },
        {
            "district": "Tarauni",
            "lga": "Tarauni",
            "sen_district": "Kano Central"
        },
        {
            "district": "Ungogo",
            "lga": "Ungogo",
            "sen_district": "Kano Central"
        },
        {
            "district": "Warawa",
            "lga": "Warawa",
            "sen_district": "Kano Central"
        },
        {
            "district": "Wudil",
            "lga": "Wudil",
            "sen_district": "Kano South"
        },
        {
            "district": "Akwanga North",
            "lga": "Akwanga North",
            "sen_district": "Nasarawa North"
        },
        {
            "district": "Akwanga South",
            "lga": "Akwanga South",
            "sen_district": "Nasarawa North"
        },
        {
            "district": "Awe North",
            "lga": "Awe North",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Awe South",
            "lga": "Awe South",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Doma North",
            "lga": "Doma North",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Doma South",
            "lga": "Doma South",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Gadabuke/Toto",
            "lga": [
                "Gadabuke",
                "Toto"
            ],
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Karshi/Uke",
            "lga": [
                "Karshi",
                "Uke"
            ],
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Karu/Gitata",
            "lga": [
                "Karu",
                "Gitata"
            ],
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Keana",
            "lga": "Keana",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Keffi East",
            "lga": "Keffi East",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Keffi West",
            "lga": "Keffi West",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Kokona East",
            "lga": "Kokona East",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Kokona West",
            "lga": "Kokona West",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Lafia Central",
            "lga": "Lafia Central",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Lafia North",
            "lga": "Lafia North",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Nasarawa Central",
            "lga": "Nasarawa Central",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Nasarawa West",
            "lga": "Nasarawa West",
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Nasarawa-Eggon East",
            "lga": "Nasarawa-Eggon East",
            "sen_district": "Nasarawa North"
        },
        {
            "district": "Nasarawa-Eggon West",
            "lga": "Nasarawa-Eggon West",
            "sen_district": "Nasarawa North"
        },
        {
            "district": "Obi I",
            "lga": "Obi I",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Obi II",
            "lga": "Obi II",
            "sen_district": "Nasarawa South"
        },
        {
            "district": "Umaisha/Dausu",
            "lga": [
                "Umaisha",
                "Dausu"
            ],
            "sen_district": "Nasarawa West"
        },
        {
            "district": "Wamba",
            "lga": "Wamba",
            "sen_district": "Nasarawa North"
        }
    ],
    "Katsina": [
        {
            "district": "Bakori",
            "lga": "Bakori",
            "sen_district": "Katsina South"
        },
        {
            "district": "Batagarawa",
            "lga": "Batagarawa",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Batsari",
            "lga": "Batsari",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Baure",
            "lga": "Baure",
            "sen_district": "Katsina North"
        },
        {
            "district": "Bindawa",
            "lga": "Bindawa",
            "sen_district": "Katsina North"
        },
        {
            "district": "Charanchi",
            "lga": "Charanchi",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Dandume",
            "lga": "Dandume",
            "sen_district": "Katsina South"
        },
        {
            "district": "Danja",
            "lga": "Danja",
            "sen_district": "Katsina South"
        },
        {
            "district": "Danmusa",
            "lga": "Danmusa",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Daura",
            "lga": "Daura",
            "sen_district": "Katsina North"
        },
        {
            "district": "Dutsi",
            "lga": "Dutsi",
            "sen_district": "Katsina North"
        },
        {
            "district": "Dutsin-Ma",
            "lga": "Dutsin-Ma",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Faskari",
            "lga": "Faskari",
            "sen_district": "Katsina South"
        },
        {
            "district": "Funtua",
            "lga": "Funtua",
            "sen_district": "Katsina South"
        },
        {
            "district": "Ingawa",
            "lga": "Ingawa",
            "sen_district": "Katsina North"
        },
        {
            "district": "Jibia",
            "lga": "Jibia",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Kafur",
            "lga": "Kafur",
            "sen_district": "Katsina South"
        },
        {
            "district": "Kaita",
            "lga": "Kaita",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Kankara",
            "lga": "Kankara",
            "sen_district": "Katsina South"
        },
        {
            "district": "Kankia",
            "lga": "Kankia",
            "sen_district": "Katsina North"
        },
        {
            "district": "Kurfi",
            "lga": "Kurfi",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Kusada",
            "lga": "Kusada",
            "sen_district": "Katsina North"
        },
        {
            "district": "Mai’Adua",
            "lga": "Mai’Adua",
            "sen_district": "Katsina North"
        },
        {
            "district": "Malumfashi East",
            "lga": "Malumfashi East",
            "sen_district": "Katsina South"
        },
        {
            "district": "Mani",
            "lga": "Mani",
            "sen_district": "Katsina North"
        },
        {
            "district": "Mashi",
            "lga": "Mashi",
            "sen_district": "Katsina North"
        },
        {
            "district": "Matazu",
            "lga": "Matazu",
            "sen_district": "Katsina South"
        },
        {
            "district": "Musawa",
            "lga": "Musawa",
            "sen_district": "Katsina South"
        },
        {
            "district": "Rimi",
            "lga": "Rimi",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Sabuwa",
            "lga": "Sabuwa",
            "sen_district": "Katsina South"
        },
        {
            "district": "Safana",
            "lga": "Safana",
            "sen_district": "Katsina Central"
        },
        {
            "district": "Sandamu",
            "lga": "Sandamu",
            "sen_district": "Katsina North"
        },
        {
            "district": "Zango",
            "lga": "Zango",
            "sen_district": "Katsina North"
        }
    ],
    "Kebbi": [
        {
            "district": "Aleiro",
            "lga": "Aleiro",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Arewa",
            "lga": "Arewa",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Argungu",
            "lga": "Argungu",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Augie",
            "lga": "Augie",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Bagudo East",
            "lga": "Bagudo East",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Bagudo West",
            "lga": "Bagudo West",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Birnin Kebbi North",
            "lga": "Birnin Kebbi North",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Birnin Kebbi South",
            "lga": "Birnin Kebbi South",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Bunza",
            "lga": "Bunza",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Dandi",
            "lga": "Dandi",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Fakai",
            "lga": "Fakai",
            "sen_district": "Kebbi South"
        },
        {
            "district": "Gwandu",
            "lga": "Gwandu",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Jega",
            "lga": "Jega",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Kalgo",
            "lga": "Kalgo",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Koko/Besse",
            "lga": [
                "Koko",
                "Besse"
            ],
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Maiyama",
            "lga": "Maiyama",
            "sen_district": "Kebbi Central"
        },
        {
            "district": "Ngaski",
            "lga": "Ngaski",
            "sen_district": "Kebbi South"
        },
        {
            "district": "Sakaba",
            "lga": "Sakaba",
            "sen_district": "Kebbi South"
        },
        {
            "district": "Shanga",
            "lga": "Shanga",
            "sen_district": "Kebbi South"
        },
        {
            "district": "Suru",
            "lga": "Suru",
            "sen_district": "Kebbi North"
        },
        {
            "district": "Wasagu/Danko East",
            "lga": [
                "Wasagu",
                "Danko East"
            ],
            "sen_district": "Kebbi South"
        },
        {
            "district": "Wasagu/Danko West",
            "lga": [
                "Wasagu",
                "Danko West"
            ],
            "sen_district": "Kebbi South"
        },
        {
            "district": "Yauri",
            "lga": "Yauri",
            "sen_district": "Kebbi South"
        },
        {
            "district": "Zuru",
            "lga": "Zuru",
            "sen_district": "Kebbi South"
        }
    ],
    "Kogi": [
        {
            "district": "Adavi",
            "lga": "Adavi",
            "sen_district": "Kogi Central"
        },
        {
            "district": "Ajaokuta",
            "lga": "Ajaokuta",
            "sen_district": "Kogi Central"
        },
        {
            "district": "Ankpa I",
            "lga": "Ankpa I",
            "sen_district": "Kogi East"
        },
        {
            "district": "Ankpa II",
            "lga": "Ankpa II",
            "sen_district": "Kogi East"
        },
        {
            "district": "Bassa",
            "lga": "Bassa",
            "sen_district": "Kogi East"
        },
        {
            "district": "Dekina/Biraidu",
            "lga": [
                "Dekina",
                "Biraidu"
            ],
            "sen_district": "Kogi East"
        },
        {
            "district": "Ibaji",
            "lga": "Ibaji",
            "sen_district": "Kogi East"
        },
        {
            "district": "Idah",
            "lga": "Idah",
            "sen_district": "Kogi East"
        },
        {
            "district": "Igalamela-Odolu",
            "lga": "Igalamela-Odolu",
            "sen_district": "Kogi East"
        },
        {
            "district": "Ijumu",
            "lga": "Ijumu",
            "sen_district": "Kogi West"
        },
        {
            "district": "Kabba/Bunu",
            "lga": [
                "Kabba",
                "Bunu"
            ],
            "sen_district": "Kogi West"
        },
        {
            "district": "Kogi (K.K)",
            "lga": "Kogi (K.K)",
            "sen_district": "Kogi West"
        },
        {
            "district": "Lokoja I",
            "lga": "Lokoja I",
            "sen_district": "Kogi West"
        },
        {
            "district": "Lokoja II",
            "lga": "Lokoja II",
            "sen_district": "Kogi West"
        },
        {
            "district": "Mopamuro",
            "lga": "Mopamuro",
            "sen_district": "Kogi West"
        },
        {
            "district": "Ofu",
            "lga": "Ofu",
            "sen_district": "Kogi East"
        },
        {
            "district": "Ogori/Magongo",
            "lga": [
                "Ogori",
                "Magongo"
            ],
            "sen_district": "Kogi Central"
        },
        {
            "district": "Okehi",
            "lga": "Okehi",
            "sen_district": "Kogi Central"
        },
        {
            "district": "Okene II (South)",
            "lga": "Okene II (South)",
            "sen_district": "Kogi Central"
        },
        {
            "district": "Okene Town",
            "lga": "Okene Town",
            "sen_district": "Kogi Central"
        },
        {
            "district": "Okura",
            "lga": "Okura",
            "sen_district": "Kogi East"
        },
        {
            "district": "Olamaboro I",
            "lga": "Olamaboro I",
            "sen_district": "Kogi East"
        },
        {
            "district": "Omala",
            "lga": "Omala",
            "sen_district": "Kogi East"
        },
        {
            "district": "Yagba East",
            "lga": "Yagba East",
            "sen_district": "Kogi West"
        },
        {
            "district": "Yagba West",
            "lga": "Yagba West",
            "sen_district": "Kogi West"
        }
    ],
    "Kwara": [
        {
            "district": "Adena/bani/Gwaria",
            "lga": [
                "Adena",
                "bani",
                "Gwaria"
            ],
            "sen_district": "Kwara North"
        },
        {
            "district": "Afon",
            "lga": "Afon",
            "sen_district": "Kwara Central"
        },
        {
            "district": "Ajikobi/Alanamu",
            "lga": [
                "Ajikobi",
                "Alanamu"
            ],
            "sen_district": "Kwara Central"
        },
        {
            "district": "Balogun/Ojomu",
            "lga": [
                "Balogun",
                "Ojomu"
            ],
            "sen_district": "Kwara South"
        }
    ],
    "Lagos": [
        {
            "district": "Agege Constituency I",
            "lga": "Agege Constituency I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Agege Constituency II",
            "lga": "Agege Constituency II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ajeromi Ifelodun I",
            "lga": "Ajeromi Ifelodun I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ajeromi Ifelodun II",
            "lga": "Ajeromi Ifelodun II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Alimosho I",
            "lga": "Alimosho I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Alimosho II",
            "lga": "Alimosho II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Amuwo Odofin I",
            "lga": "Amuwo Odofin I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Amuwo Odofin II",
            "lga": "Amuwo Odofin II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Apapa I",
            "lga": "Apapa I",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Apapa II",
            "lga": "Apapa II",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Badagry I",
            "lga": "Badagry I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Badagry II",
            "lga": "Badagry II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Epe I",
            "lga": "Epe I",
            "sen_district": "Lagos East"
        },
        {
            "district": "Epe II",
            "lga": "Epe II",
            "sen_district": "Lagos East"
        },
        {
            "district": "Eti-Osa Constituency I",
            "lga": "Eti-Osa Constituency I",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Eti-Osa Constituency II",
            "lga": "Eti-Osa Constituency II",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Ibeju Lekki I",
            "lga": "Ibeju Lekki I",
            "sen_district": "Lagos East"
        },
        {
            "district": "Ibeju Lekki II",
            "lga": "Ibeju Lekki II",
            "sen_district": "Lagos East"
        },
        {
            "district": "Ifako-Ijaiye I",
            "lga": "Ifako-Ijaiye I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ifako-Ijaiye II",
            "lga": "Ifako-Ijaiye II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ikeja I",
            "lga": "Ikeja I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ikeja II",
            "lga": "Ikeja II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ikorodu I",
            "lga": "Ikorodu I",
            "sen_district": "Lagos East"
        },
        {
            "district": "Ikorodu II",
            "lga": "Ikorodu II",
            "sen_district": "Lagos East"
        },
        {
            "district": "Kosofe I",
            "lga": "Kosofe I",
            "sen_district": "Lagos East"
        },
        {
            "district": "Kosofe II",
            "lga": "Kosofe II",
            "sen_district": "Lagos East"
        },
        {
            "district": "Lagos Island I",
            "lga": "Lagos Island I",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Lagos Island II",
            "lga": "Lagos Island II",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Lagos Mainland I",
            "lga": "Lagos Mainland I",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Lagos Mainland II",
            "lga": "Lagos Mainland II",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Mushin I",
            "lga": "Mushin I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Mushin II",
            "lga": "Mushin II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ojo I",
            "lga": "Ojo I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Ojo II",
            "lga": "Ojo II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Oshodi-Isolo I",
            "lga": "Oshodi-Isolo I",
            "sen_district": "Lagos West"
        },
        {
            "district": "Oshodi-Isolo II",
            "lga": "Oshodi-Isolo II",
            "sen_district": "Lagos West"
        },
        {
            "district": "Somolu I",
            "lga": "Somolu I",
            "sen_district": "Lagos East"
        },
        {
            "district": "Somolu II",
            "lga": "Somolu II",
            "sen_district": "Lagos East"
        },
        {
            "district": "Surulere",
            "lga": "Surulere",
            "sen_district": "Lagos Central"
        },
        {
            "district": "Surulere",
            "lga": "Surulere",
            "sen_district": "Lagos Central"
        }
    ],
    "Niger": [
        {
            "district": "Agaie",
            "lga": "Agaie",
            "sen_district": "Niger South"
        },
        {
            "district": "Agwara",
            "lga": "Agwara",
            "sen_district": "Niger North"
        },
        {
            "district": "Bida I",
            "lga": "Bida I",
            "sen_district": "Niger South"
        },
        {
            "district": "Bida II",
            "lga": "Bida II",
            "sen_district": "Niger South"
        },
        {
            "district": "Borgu",
            "lga": "Borgu",
            "sen_district": "Niger North"
        },
        {
            "district": "Bosso",
            "lga": "Bosso",
            "sen_district": "Niger East"
        },
        {
            "district": "Chanchanga",
            "lga": "Chanchanga",
            "sen_district": "Niger East"
        },
        {
            "district": "Edatti",
            "lga": "Edatti",
            "sen_district": "Niger South"
        },
        {
            "district": "Gbako",
            "lga": "Gbako",
            "sen_district": "Niger South"
        },
        {
            "district": "Gurara",
            "lga": "Gurara",
            "sen_district": "Niger East"
        },
        {
            "district": "Katcha",
            "lga": "Katcha",
            "sen_district": "Niger South"
        },
        {
            "district": "Kontagora I",
            "lga": "Kontagora I",
            "sen_district": "Niger North"
        },
        {
            "district": "Kotangora II",
            "lga": "Kotangora II",
            "sen_district": "Niger North"
        },
        {
            "district": "Lapai",
            "lga": "Lapai",
            "sen_district": "Niger South"
        },
        {
            "district": "Lavun",
            "lga": "Lavun",
            "sen_district": "Niger South"
        },
        {
            "district": "Magama",
            "lga": "Magama",
            "sen_district": "Niger North"
        },
        {
            "district": "Mariga",
            "lga": "Mariga",
            "sen_district": "Niger North"
        },
        {
            "district": "Mashegu",
            "lga": "Mashegu",
            "sen_district": "Niger North"
        },
        {
            "district": "Mokwa",
            "lga": "Mokwa",
            "sen_district": "Niger South"
        },
        {
            "district": "Munya",
            "lga": "Munya",
            "sen_district": "Niger East"
        },
        {
            "district": "Paikoro",
            "lga": "Paikoro",
            "sen_district": "Niger East"
        },
        {
            "district": "Rafi",
            "lga": "Rafi",
            "sen_district": "Niger East"
        },
        {
            "district": "Rijau",
            "lga": "Rijau",
            "sen_district": "Niger North"
        },
        {
            "district": "Shiroro",
            "lga": "Shiroro",
            "sen_district": "Niger East"
        },
        {
            "district": "Suleja",
            "lga": "Suleja",
            "sen_district": "Niger East"
        },
        {
            "district": "Tafa",
            "lga": "Tafa",
            "sen_district": "Niger East"
        },
        {
            "district": "Wushishi",
            "lga": "Wushishi",
            "sen_district": "Niger North"
        }
    ],
    "Ogun": [
        {
            "district": "Abeokuta North",
            "lga": "Abeokuta North",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Abeokuta South 1",
            "lga": "Abeokuta South 1",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Abeokuta South 2",
            "lga": "Abeokuta South 2",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Ado-Odo/Ota I",
            "lga": [
                "Ado-Odo",
                "Ota I"
            ],
            "sen_district": "Ogun West"
        },
        {
            "district": "Ado-Odo/Ota II",
            "lga": [
                "Ado-Odo",
                "Ota II"
            ],
            "sen_district": "Ogun West"
        },
        {
            "district": "Egbado North I",
            "lga": "Egbado North I",
            "sen_district": "Ogun West"
        },
        {
            "district": "Egbado North II",
            "lga": "Egbado North II",
            "sen_district": "Ogun West"
        },
        {
            "district": "Ewekoro",
            "lga": "Ewekoro",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Ifo 2",
            "lga": "Ifo 2",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Ifo I",
            "lga": "Ifo I",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Ijebu East",
            "lga": "Ijebu East",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ijebu North 1",
            "lga": "Ijebu North 1",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ijebu North 2",
            "lga": "Ijebu North 2",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ijebu North East",
            "lga": "Ijebu North East",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ijebu Ode",
            "lga": "Ijebu Ode",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ikenne",
            "lga": "Ikenne",
            "sen_district": "Ogun East"
        },
        {
            "district": "Imeko/Afon",
            "lga": [
                "Imeko",
                "Afon"
            ],
            "sen_district": "Ogun West"
        },
        {
            "district": "Ipokia/Idiroko",
            "lga": [
                "Ipokia",
                "Idiroko"
            ],
            "sen_district": "Ogun West"
        },
        {
            "district": "Obafemi Owode",
            "lga": "Obafemi Owode",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Odeda",
            "lga": "Odeda",
            "sen_district": "Ogun Central"
        },
        {
            "district": "Odogbolu",
            "lga": "Odogbolu",
            "sen_district": "Ogun East"
        },
        {
            "district": "Ogun Water side",
            "lga": "Ogun Water side",
            "sen_district": "Ogun East"
        },
        {
            "district": "Remo North",
            "lga": "Remo North",
            "sen_district": "Ogun East"
        },
        {
            "district": "Sagamu I Offin",
            "lga": "Sagamu I Offin",
            "sen_district": "Ogun East"
        },
        {
            "district": "Sagamu II",
            "lga": "Sagamu II",
            "sen_district": "Ogun East"
        },
        {
            "district": "Yewa South",
            "lga": "Yewa South",
            "sen_district": "Ogun West"
        }
    ],
    "Ondo": [
        {
            "district": "Akoko North East",
            "lga": "Akoko North East",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akoko North West I",
            "lga": "Akoko North West I",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akoko North West II",
            "lga": "Akoko North West II",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akoko South East",
            "lga": "Akoko South East",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akoko South West I",
            "lga": "Akoko South West I",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akoko South West II",
            "lga": "Akoko South West II",
            "sen_district": "Ondo North"
        },
        {
            "district": "Akure South I",
            "lga": "Akure South I",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Akure South II",
            "lga": "Akure South II",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ese Odo",
            "lga": "Ese Odo",
            "sen_district": "Ondo South"
        },
        {
            "district": "Idanre",
            "lga": "Idanre",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ifedore",
            "lga": "Ifedore",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ilaje I",
            "lga": "Ilaje I",
            "sen_district": "Ondo South"
        },
        {
            "district": "Ilaje II",
            "lga": "Ilaje II",
            "sen_district": "Ondo South"
        },
        {
            "district": "Ileoluji/Okeigbo",
            "lga": [
                "Ileoluji",
                "Okeigbo"
            ],
            "sen_district": "Ondo South"
        },
        {
            "district": "Irele",
            "lga": "Irele",
            "sen_district": "Ondo South"
        },
        {
            "district": "Odigbo I",
            "lga": "Odigbo I",
            "sen_district": "Ondo South"
        },
        {
            "district": "Odigbo II",
            "lga": "Odigbo II",
            "sen_district": "Ondo South"
        },
        {
            "district": "Okitipupa I",
            "lga": "Okitipupa I",
            "sen_district": "Ondo South"
        },
        {
            "district": "Okitipupa II",
            "lga": "Okitipupa II",
            "sen_district": "Ondo South"
        },
        {
            "district": "Ondo East",
            "lga": "Ondo East",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ondo West I",
            "lga": "Ondo West I",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ondo West II",
            "lga": "Ondo West II",
            "sen_district": "Ondo Central"
        },
        {
            "district": "Ose",
            "lga": "Ose",
            "sen_district": "Ondo North"
        },
        {
            "district": "Owo I",
            "lga": "Owo I",
            "sen_district": "Ondo North"
        },
        {
            "district": "Owo II",
            "lga": "Owo II",
            "sen_district": "Ondo North"
        }
    ],
    "Osun": [
        {
            "district": "Atakunmosa East/West",
            "lga": [
                "Atakunmosa East",
                "West"
            ],
            "sen_district": "Osun East"
        },
        {
            "district": "Ayedade",
            "lga": "Ayedade",
            "sen_district": "Osun West"
        },
        {
            "district": "Ayedire",
            "lga": "Ayedire",
            "sen_district": "Osun West"
        },
        {
            "district": "Boripe/Boluwa-Duro",
            "lga": [
                "Boripe",
                "Boluwa-Duro"
            ],
            "sen_district": "Osun Central"
        },
        {
            "district": "Ede North",
            "lga": "Ede North",
            "sen_district": "Osun West"
        },
        {
            "district": "Ede South",
            "lga": "Ede South",
            "sen_district": "Osun West"
        },
        {
            "district": "Egbedore",
            "lga": "Egbedore",
            "sen_district": "Osun West"
        },
        {
            "district": "Ejigbo",
            "lga": "Ejigbo",
            "sen_district": "Osun West"
        },
        {
            "district": "Ife Central",
            "lga": "Ife Central",
            "sen_district": "Osun East"
        },
        {
            "district": "Ife East",
            "lga": "Ife East",
            "sen_district": "Osun East"
        },
        {
            "district": "Ife North",
            "lga": "Ife North",
            "sen_district": "Osun East"
        },
        {
            "district": "Ife South",
            "lga": "Ife South",
            "sen_district": "Osun East"
        },
        {
            "district": "Ifedayo",
            "lga": "Ifedayo",
            "sen_district": "Osun Central"
        },
        {
            "district": "Ifelodun",
            "lga": "Ifelodun",
            "sen_district": "Osun Central"
        },
        {
            "district": "Ila",
            "lga": "Ila",
            "sen_district": "Osun Central"
        },
        {
            "district": "Ilesa East",
            "lga": "Ilesa East",
            "sen_district": "Osun East"
        },
        {
            "district": "Ilesa West",
            "lga": "Ilesa West",
            "sen_district": "Osun East"
        },
        {
            "district": "Irepodun/Orulu",
            "lga": [
                "Irepodun",
                "Orulu"
            ],
            "sen_district": "Osun Central"
        },
        {
            "district": "Irewole/Isokan",
            "lga": [
                "Irewole",
                "Isokan"
            ],
            "sen_district": "Osun West"
        },
        {
            "district": "Iwo",
            "lga": "Iwo",
            "sen_district": "Osun West"
        },
        {
            "district": "Obokun",
            "lga": "Obokun",
            "sen_district": "Osun East"
        },
        {
            "district": "Odo-Otin",
            "lga": "Odo-Otin",
            "sen_district": "Osun Central"
        },
        {
            "district": "Ola-Oluwa",
            "lga": "Ola-Oluwa",
            "sen_district": "Osun West"
        },
        {
            "district": "Olorunda",
            "lga": "Olorunda",
            "sen_district": "Osun Central"
        },
        {
            "district": "Oriade",
            "lga": "Oriade",
            "sen_district": "Osun East"
        },
        {
            "district": "Osogbo",
            "lga": "Osogbo",
            "sen_district": "Osun Central"
        }
    ],
    "Oyo": [
        {
            "district": "Afijio",
            "lga": "Afijio",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Akinyele I",
            "lga": "Akinyele I",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Akinyele II",
            "lga": "Akinyele II",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Atiba",
            "lga": "Atiba",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Egbeda",
            "lga": "Egbeda",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Ibadan North East I",
            "lga": "Ibadan North East I",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan North I",
            "lga": "Ibadan North I",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan North II",
            "lga": "Ibadan North II",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan North West",
            "lga": "Ibadan North West",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan North-East II",
            "lga": "Ibadan North-East II",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan South West II",
            "lga": "Ibadan South West II",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan South-East I",
            "lga": "Ibadan South-East I",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan South-East II",
            "lga": "Ibadan South-East II",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibadan South-West I",
            "lga": "Ibadan South-West I",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibarapa East",
            "lga": "Ibarapa East",
            "sen_district": "Oyo South"
        },
        {
            "district": "Ibarapa North/Central",
            "lga": [
                "Ibarapa North",
                "Central"
            ],
            "sen_district": "Oyo South"
        },
        {
            "district": "Ido",
            "lga": "Ido",
            "sen_district": "Oyo South"
        },
        {
            "district": "Irepo & Olorunsogo",
            "lga": "Irepo & Olorunsogo",
            "sen_district": "Oyo North"
        },
        {
            "district": "Iseyin And Itesiwaju",
            "lga": "Iseyin And Itesiwaju",
            "sen_district": "Oyo North"
        },
        {
            "district": "Iwajowa",
            "lga": "Iwajowa",
            "sen_district": "Oyo North"
        },
        {
            "district": "Kajola",
            "lga": "Kajola",
            "sen_district": "Oyo North"
        },
        {
            "district": "Lagelu",
            "lga": "Lagelu",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Ogbomoso North",
            "lga": "Ogbomoso North",
            "sen_district": "Oyo North"
        },
        {
            "district": "Ogbomoso South",
            "lga": "Ogbomoso South",
            "sen_district": "Oyo North"
        },
        {
            "district": "Ogo-Oluwa / Surulere",
            "lga": [
                "Ogo-Oluwa",
                "Surulere"
            ],
            "sen_district": "Oyo Central"
        },
        {
            "district": "Oluyole",
            "lga": "Oluyole",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Ona-Ara",
            "lga": "Ona-Ara",
            "sen_district": "Oyo Central"
        },
        {
            "district": "Oorelope",
            "lga": "Oorelope",
            "sen_district": "Oyo North"
        },
        {
            "district": "Oriire",
            "lga": "Oriire",
            "sen_district": "Oyo North"
        },
        {
            "district": "Oyo West / Oyo East",
            "lga": [
                "Oyo West",
                "Oyo East"
            ],
            "sen_district": "Oyo Central"
        },
        {
            "district": "Saki East And Atisbo",
            "lga": "Saki East And Atisbo",
            "sen_district": "Oyo North"
        },
        {
            "district": "Saki West",
            "lga": "Saki West",
            "sen_district": "Oyo North"
        }
    ],
    "Plateau": [
        {
            "district": "Barkin Ladi",
            "lga": "Barkin Ladi",
            "sen_district": "Plateau North"
        },
        {
            "district": "Bokkos",
            "lga": "Bokkos",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Dengi",
            "lga": "Dengi",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Jos East",
            "lga": "Jos East",
            "sen_district": "Plateau North"
        },
        {
            "district": "Jos North",
            "lga": "Jos North",
            "sen_district": "Plateau North"
        },
        {
            "district": "Jos North West",
            "lga": "Jos North West",
            "sen_district": "Plateau North"
        },
        {
            "district": "Jos South",
            "lga": "Jos South",
            "sen_district": "Plateau North"
        },
        {
            "district": "Kanke",
            "lga": "Kanke",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Kantana",
            "lga": "Kantana",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Langtang Central",
            "lga": "Langtang Central",
            "sen_district": "Plateau South"
        },
        {
            "district": "Langtang North",
            "lga": "Langtang North",
            "sen_district": "Plateau South"
        },
        {
            "district": "Langtang South",
            "lga": "Langtang South",
            "sen_district": "Plateau South"
        },
        {
            "district": "Mangu North",
            "lga": "Mangu North",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Mangu South",
            "lga": "Mangu South",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Mikang",
            "lga": "Mikang",
            "sen_district": "Plateau South"
        },
        {
            "district": "Pankshin North",
            "lga": "Pankshin North",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Pankshin South",
            "lga": "Pankshin South",
            "sen_district": "Plateau Central"
        },
        {
            "district": "Pengana",
            "lga": "Pengana",
            "sen_district": "Plateau North"
        },
        {
            "district": "Qua’An Pan North",
            "lga": "Qua’An Pan North",
            "sen_district": "Plateau South"
        },
        {
            "district": "Qua’An Pan South",
            "lga": "Qua’An Pan South",
            "sen_district": "Plateau South"
        },
        {
            "district": "Riyom",
            "lga": "Riyom",
            "sen_district": "Plateau North"
        },
        {
            "district": "Rukuba/Irigwe",
            "lga": [
                "Rukuba",
                "Irigwe"
            ],
            "sen_district": "Plateau North"
        },
        {
            "district": "Shendam",
            "lga": "Shendam",
            "sen_district": "Plateau South"
        },
        {
            "district": "Wase",
            "lga": "Wase",
            "sen_district": "Plateau South"
        }
    ],
    "Rivers": [
        {
            "district": "Abua/Odual",
            "lga": [
                "Abua",
                "Odual"
            ],
            "sen_district": "Rivers West"
        },
        {
            "district": "Ahaoda West",
            "lga": "Ahaoda West",
            "sen_district": "Rivers West"
        },
        {
            "district": "Ahoada",
            "lga": "Ahoada",
            "sen_district": "Rivers West"
        },
        {
            "district": "Ahoada East 1",
            "lga": "Ahoada East 1",
            "sen_district": "Rivers West"
        },
        {
            "district": "Akuku Toru 2",
            "lga": "Akuku Toru 2",
            "sen_district": "Rivers West"
        },
        {
            "district": "Akuku-Toru 1",
            "lga": "Akuku-Toru 1",
            "sen_district": "Rivers West"
        },
        {
            "district": "Andoni 1",
            "lga": "Andoni 1",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Asari-Toru 1",
            "lga": "Asari-Toru 1",
            "sen_district": "Rivers West"
        },
        {
            "district": "Asari-Toru 2",
            "lga": "Asari-Toru 2",
            "sen_district": "Rivers West"
        },
        {
            "district": "Bonny",
            "lga": "Bonny",
            "sen_district": "Rivers West"
        },
        {
            "district": "Degema",
            "lga": "Degema",
            "sen_district": "Rivers West"
        },
        {
            "district": "Eleme",
            "lga": "Eleme",
            "sen_district": "Rivers East"
        },
        {
            "district": "Emohua",
            "lga": "Emohua",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Etche I",
            "lga": "Etche I",
            "sen_district": "Rivers East"
        },
        {
            "district": "Etche II",
            "lga": "Etche II",
            "sen_district": "Rivers East"
        },
        {
            "district": "Gokana",
            "lga": "Gokana",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Ikwere I",
            "lga": "Ikwere I",
            "sen_district": "Rivers East"
        },
        {
            "district": "Khana 1",
            "lga": "Khana 1",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Khana 2",
            "lga": "Khana 2",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Obio/Akpor I",
            "lga": [
                "Obio",
                "Akpor I"
            ],
            "sen_district": "Rivers East"
        },
        {
            "district": "Obio/Akpor II",
            "lga": [
                "Obio",
                "Akpor II"
            ],
            "sen_district": "Rivers East"
        },
        {
            "district": "Ogba/Egbema/Ndoni",
            "lga": [
                "Ogba",
                "Egbema",
                "Ndoni"
            ],
            "sen_district": "Rivers West"
        },
        {
            "district": "Ogu/Bolo",
            "lga": [
                "Ogu",
                "Bolo"
            ],
            "sen_district": "Rivers West"
        },
        {
            "district": "Okrika",
            "lga": "Okrika",
            "sen_district": "Rivers East"
        },
        {
            "district": "Omuma",
            "lga": "Omuma",
            "sen_district": "Rivers East"
        },
        {
            "district": "Onelga",
            "lga": "Onelga",
            "sen_district": "Rivers East"
        },
        {
            "district": "Opobo/Nkoro",
            "lga": [
                "Opobo",
                "Nkoro"
            ],
            "sen_district": "Rivers South East"
        },
        {
            "district": "Oyigbo",
            "lga": "Oyigbo",
            "sen_district": "Rivers South East"
        },
        {
            "district": "Port-Harcourt I",
            "lga": "Port-Harcourt I",
            "sen_district": "Rivers East"
        },
        {
            "district": "Port-Harcourt II",
            "lga": "Port-Harcourt II",
            "sen_district": "Rivers East"
        },
        {
            "district": "Port-Harcourt III",
            "lga": "Port-Harcourt III",
            "sen_district": "Rivers East"
        },
        {
            "district": "Tai",
            "lga": "Tai",
            "sen_district": "Rivers South East"
        }
    ],
    "Sokoto": [
        {
            "district": "Binji",
            "lga": "Binji",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Bodinga North",
            "lga": "Bodinga North",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Bodinga South",
            "lga": "Bodinga South",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Dange Shuni",
            "lga": "Dange Shuni",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Gada East",
            "lga": "Gada East",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Gada West",
            "lga": "Gada West",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Goronyo",
            "lga": "Goronyo",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Gudu",
            "lga": "Gudu",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Gwadabawa North",
            "lga": "Gwadabawa North",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Gwadabawa South",
            "lga": "Gwadabawa South",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Illela",
            "lga": "Illela",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Isa",
            "lga": "Isa",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Kebbe",
            "lga": "Kebbe",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Kware",
            "lga": "Kware",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Rabah",
            "lga": "Rabah",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Sabon Birni North",
            "lga": "Sabon Birni North",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Sabon Birni South",
            "lga": "Sabon Birni South",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Shagari",
            "lga": "Shagari",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Silame",
            "lga": "Silame",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Sokoto North I",
            "lga": "Sokoto North I",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Sokoto North II",
            "lga": "Sokoto North II",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Sokoto South I",
            "lga": "Sokoto South I",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Sokoto South II",
            "lga": "Sokoto South II",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Tambuwal East",
            "lga": "Tambuwal East",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Tambuwal West",
            "lga": "Tambuwal West",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Tangaza",
            "lga": "Tangaza",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Tureta",
            "lga": "Tureta",
            "sen_district": "Sokoto South"
        },
        {
            "district": "Wamakko",
            "lga": "Wamakko",
            "sen_district": "Sokoto North"
        },
        {
            "district": "Wurno",
            "lga": "Wurno",
            "sen_district": "Sokoto East"
        },
        {
            "district": "Yabo",
            "lga": "Yabo",
            "sen_district": "Sokoto South"
        }
    ],
    "Taraba": [
        {
            "district": "Ardo-Kola",
            "lga": "Ardo-Kola",
            "sen_district": "Taraba North"
        },
        {
            "district": "Bali I",
            "lga": "Bali I",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Bali II",
            "lga": "Bali II",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Donda",
            "lga": "Donda",
            "sen_district": "Taraba South"
        },
        {
            "district": "Gashaka",
            "lga": "Gashaka",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Gassol I",
            "lga": "Gassol I",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Gassol II",
            "lga": "Gassol II",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Gembu",
            "lga": "Gembu",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Ibi",
            "lga": "Ibi",
            "sen_district": "Taraba South"
        },
        {
            "district": "Jalingo I",
            "lga": "Jalingo I",
            "sen_district": "Taraba North"
        },
        {
            "district": "Jalingo II",
            "lga": "Jalingo II",
            "sen_district": "Taraba North"
        },
        {
            "district": "Karim Lamido I",
            "lga": "Karim Lamido I",
            "sen_district": "Taraba North"
        },
        {
            "district": "Karim Lamido II",
            "lga": "Karim Lamido II",
            "sen_district": "Taraba North"
        },
        {
            "district": "Kashimbila",
            "lga": "Kashimbila",
            "sen_district": "Taraba South"
        },
        {
            "district": "Kurmi",
            "lga": "Kurmi",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Lau",
            "lga": "Lau",
            "sen_district": "Taraba North"
        },
        {
            "district": "Mbamnga",
            "lga": "Mbamnga",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Nguroje",
            "lga": "Nguroje",
            "sen_district": "Taraba Central"
        },
        {
            "district": "Takum I",
            "lga": "Takum I",
            "sen_district": "Taraba South"
        },
        {
            "district": "Takum II",
            "lga": "Takum II",
            "sen_district": "Taraba South"
        },
        {
            "district": "Ussa/Likam",
            "lga": [
                "Ussa",
                "Likam"
            ],
            "sen_district": "Taraba South"
        },
        {
            "district": "Wukari I",
            "lga": "Wukari I",
            "sen_district": "Taraba South"
        },
        {
            "district": "Wukari II",
            "lga": "Wukari II",
            "sen_district": "Taraba South"
        },
        {
            "district": "Yorro",
            "lga": "Yorro",
            "sen_district": "Taraba North"
        },
        {
            "district": "Zing",
            "lga": "Zing",
            "sen_district": "Taraba North"
        }
    ],
    "Yobe": [
        {
            "district": "Bade Central",
            "lga": "Bade Central",
            "sen_district": "Yobe North"
        },
        {
            "district": "Bade West",
            "lga": "Bade West",
            "sen_district": "Yobe North"
        },
        {
            "district": "Bursari",
            "lga": "Bursari",
            "sen_district": "Yobe East"
        },
        {
            "district": "Damagum",
            "lga": "Damagum",
            "sen_district": "Yobe South"
        },
        {
            "district": "Damaturu I",
            "lga": "Damaturu I",
            "sen_district": "Yobe East"
        },
        {
            "district": "Damaturu II",
            "lga": "Damaturu II",
            "sen_district": "Yobe East"
        },
        {
            "district": "Fika/Ngalda",
            "lga": [
                "Fika",
                "Ngalda"
            ],
            "sen_district": "Yobe South"
        },
        {
            "district": "Geidam North",
            "lga": "Geidam North",
            "sen_district": "Yobe East"
        },
        {
            "district": "Geidam South",
            "lga": "Geidam South",
            "sen_district": "Yobe East"
        },
        {
            "district": "Goya/Ngeji",
            "lga": [
                "Goya",
                "Ngeji"
            ],
            "sen_district": "Yobe South"
        },
        {
            "district": "Gujba",
            "lga": "Gujba",
            "sen_district": "Yobe East"
        },
        {
            "district": "Gulani",
            "lga": "Gulani",
            "sen_district": "Yobe East"
        },
        {
            "district": "Jajere",
            "lga": "Jajere",
            "sen_district": "Yobe East"
        },
        {
            "district": "Jakusko",
            "lga": "Jakusko",
            "sen_district": "Yobe North"
        },
        {
            "district": "Karasuwa",
            "lga": "Karasuwa",
            "sen_district": "Yobe North"
        },
        {
            "district": "Machina",
            "lga": "Machina",
            "sen_district": "Yobe North"
        },
        {
            "district": "Mamudo",
            "lga": "Mamudo",
            "sen_district": "Yobe South"
        },
        {
            "district": "Nangere",
            "lga": "Nangere",
            "sen_district": "Yobe South"
        },
        {
            "district": "Nguru I",
            "lga": "Nguru I",
            "sen_district": "Yobe North"
        },
        {
            "district": "Nguru II",
            "lga": "Nguru II",
            "sen_district": "Yobe North"
        },
        {
            "district": "Potiskum Town",
            "lga": "Potiskum Town",
            "sen_district": "Yobe South"
        },
        {
            "district": "Tarmuwa",
            "lga": "Tarmuwa",
            "sen_district": "Yobe East"
        },
        {
            "district": "Yunusari I",
            "lga": "Yunusari I",
            "sen_district": "Yobe East"
        },
        {
            "district": "Yusufari II",
            "lga": "Yusufari II",
            "sen_district": "Yobe North"
        }
    ],
    "Zamfara": [
        {
            "district": "Anka",
            "lga": "Anka",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Bakura",
            "lga": "Bakura",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Birnin Magaji",
            "lga": "Birnin Magaji",
            "sen_district": "Zamfara North"
        },
        {
            "district": "Bukkuyum North",
            "lga": "Bukkuyum North",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Bukkuyum South",
            "lga": "Bukkuyum South",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Bungudu East",
            "lga": "Bungudu East",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Bungudu West",
            "lga": "Bungudu West",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Gummi I",
            "lga": "Gummi I",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Gummi II",
            "lga": "Gummi II",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Gusau East",
            "lga": "Gusau East",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Gusau West",
            "lga": "Gusau West",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Kaura Namoda North",
            "lga": "Kaura Namoda North",
            "sen_district": "Zamfara North"
        },
        {
            "district": "Kaura Namoda South",
            "lga": "Kaura Namoda South",
            "sen_district": "Zamfara North"
        },
        {
            "district": "Maradun I",
            "lga": "Maradun I",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Maradun II",
            "lga": "Maradun II",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Maru North",
            "lga": "Maru North",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Maru South",
            "lga": "Maru South",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Shinkafi",
            "lga": "Shinkafi",
            "sen_district": "Zamfara North"
        },
        {
            "district": "Talata Mafara North",
            "lga": "Talata Mafara North",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Talata Mafara South",
            "lga": "Talata Mafara South",
            "sen_district": "Zamfara West"
        },
        {
            "district": "Tsafe East",
            "lga": "Tsafe East",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Tsafe West",
            "lga": "Tsafe West",
            "sen_district": "Zamfara Central"
        },
        {
            "district": "Zurmi East",
            "lga": "Zurmi East",
            "sen_district": "Zamfara North"
        },
        {
            "district": "Zurmi West",
            "lga": "Zurmi West",
            "sen_district": "Zamfara North"
        }
    ]
}

const GREEN_CHAMBER_MAP = [
    {
        "state": "Abia",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Aba North/Aba South",
                "lgas": ["Aba North", "Aba South"]
            },
            {
                "name": "Arochukwu/Ohafia",
                "lgas": ["Arochukwu", "Ohafia"]
            },
            {
                "name": "Bende",
                "lgas": ["Bende"]
            },
            {
                "name": "Isiala Ngwa North/Isiala Ngwa South",
                "lgas": ["Isiala Ngwa North", "Isiala Ngwa South"]
            },
            {
                "name": "Isuikwuato/Umunneochi",
                "lgas": ["Isuikwuato", "Umunneochi"]
            },
            {
                "name": "Obingwa/Ugwunagbo/Osisioma",
                "lgas": ["Obingwa", "Ugwunagbo", "Osisioma"]
            },
            {
                "name": "Ukwa East/Ukwa West",
                "lgas": ["Ukwa East", "Ukwa West"]
            },
            {
                "name": "Ikwuano/Umuahia North/Umuahia South",
                "lgas": ["Ikwuano", "Umuahia North", "Umuahia South"]
            }
        ]
    },
    {
        "state": "Adamawa",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Demsa/Numan/Lamurde",
                "lgas": ["Demsa", "Numan", "Lamurde"]
            },
            {
                "name": "Fufore/Song",
                "lgas": ["Fufore", "Song"]
            },
            {
                "name": "Ganye/Jada/Mayo Belwa/Toungo",
                "lgas": ["Ganye", "Jada", "Mayo-Belwa", "Toungo"]
            },
            {
                "name": "Guyuk/Shelleng",
                "lgas": ["Guyuk", "Shelleng"]
            },
            {
                "name": "Hong/Gombi",
                "lgas": ["Hong", "Gombi"]
            },
            {
                "name": "Madagali/Michika",
                "lgas": ["Madagali", "Michika"]
            },
            {
                "name": "Mubi North/Mubi South/Maiha",
                "lgas": ["Mubi North", "Mubi South", "Maiha"]
            },
            {
                "name": "Yola North/Yola South/Girei",
                "lgas": ["Yola North", "Yola South", "Girei"]
            }
        ]
    },
    {
        "state": "Akwa-Ibom",
        "total_constituencies": 10,
        "constituencies": [
            {
                "name": "Abak/Etim Ekpo/Ika",
                "lgas": ["Abak", "Etim Ekpo", "Ika"]
            },
            {
                "name": "Eket/Onna/Esit Eket/Ibeno",
                "lgas": ["Eket", "Onna", "Esit Eket", "Ibeno"]
            },
            {
                "name": "Etinan/Nsit Ibom/Nsit Ubium",
                "lgas": ["Etinan", "Nsit Ibom", "Nsit Ubium"]
            },
            {
                "name": "Ikono/Ini",
                "lgas": ["Ikono", "Ini"]
            },
            {
                "name": "Ikot Ekpene/Essien Udim/Obot Akara",
                "lgas": ["Ikot Ekpene", "Essien Udim", "Obot Akara"]
            },
            {
                "name": "Itu/Ibiono Ibom",
                "lgas": ["Itu", "Ibiono Ibom"]
            },
            {
                "name": "Mbo/Okobo/Oron/Udung Uko/Urue Offong/Oruko",
                "lgas": ["Mbo", "Okobo", "Oron", "Udung Uko", "Urue Offong/Oruko"]
            },
            {
                "name": "Ukanafun/Oruk Anam",
                "lgas": ["Ukanafun", "Oruk Anam"]
            },
            {
                "name": "Uyo/Uruan/Nsit Atai/Ibesikpo Asutan",
                "lgas": ["Uyo", "Uruan", "Nsit Atai", "Ibesikpo Asutan"]
            },
            {
                "name": "Ikot Abasi/Mkpat Enin/Eastern Obolo",
                "lgas": ["Ikot Abasi", "Mkpat Enin", "Eastern Obolo"]
            }
        ]
    },
    {
        "state": "Anambra",
        "total_constituencies": 11,
        "constituencies": [
            {
                "name": "Aguata",
                "lgas": ["Aguata"]
            },
            {
                "name": "Anambra East/Anambra West",
                "lgas": ["Anambra East", "Anambra West"]
            },
            {
                "name": "Awka North/Awka South",
                "lgas": ["Awka North", "Awka South"]
            },
            {
                "name": "Idemili North/Idemili South",
                "lgas": ["Idemili North", "Idemili South"]
            },
            {
                "name": "Ihiala",
                "lgas": ["Ihiala"]
            },
            {
                "name": "Nnewi North/Nnewi South/Ekwusigo",
                "lgas": ["Nnewi North", "Nnewi South", "Ekwusigo"]
            },
            {
                "name": "Ogbaru",
                "lgas": ["Ogbaru"]
            },
            {
                "name": "Onitsha North/Onitsha South",
                "lgas": ["Onitsha North", "Onitsha South"]
            },
            {
                "name": "Orumba North/Orumba South",
                "lgas": ["Orumba North", "Orumba South"]
            },
            {
                "name": "Oyi/Ayamelum",
                "lgas": ["Oyi", "Ayamelum"]
            },
            {
                "name": "Anaocha/Njikoka/Dunukofia",
                "lgas": ["Anaocha", "Njikoka", "Dunukofia"]
            }
        ]
    },
    {
        "state": "Bauchi",
        "total_constituencies": 12,
        "constituencies": [
            {
                "name": "Alkaleri/Kirfi",
                "lgas": ["Alkaleri", "Kirfi"]
            },
            {
                "name": "Bauchi",
                "lgas": ["Bauchi"]
            },
            {
                "name": "Bogoro/Dass/Tafawa Balewa",
                "lgas": ["Bogoro", "Dass", "Tafawa Balewa"]
            },
            {
                "name": "Darazo/Ganjuwa",
                "lgas": ["Darazo", "Ganjuwa"]
            },
            {
                "name": "Gamawa",
                "lgas": ["Gamawa"]
            },
            {
                "name": "Jama'are/Itas-Gadau",
                "lgas": ["Jama'are", "Itas/Gadau"]
            },
            {
                "name": "Katagum",
                "lgas": ["Katagum"]
            },
            {
                "name": "Misau/Dambam",
                "lgas": ["Misau", "Dambam"]
            },
            {
                "name": "Ningi/Warji",
                "lgas": ["Ningi", "Warji"]
            },
            {
                "name": "Shira/Giade",
                "lgas": ["Shira", "Giade"]
            },
            {
                "name": "Toro",
                "lgas": ["Toro"]
            },
            {
                "name": "Zaki",
                "lgas": ["Zaki"]
            }
        ]
    },
    {
        "state": "Bayelsa",
        "total_constituencies": 5,
        "constituencies": [
            {
                "name": "Brass/Nembe",
                "lgas": ["Brass", "Nembe"]
            },
            {
                "name": "Ogbia",
                "lgas": ["Ogbia"]
            },
            {
                "name": "Sagbama/Ekeremor",
                "lgas": ["Sagbama", "Ekeremor"]
            },
            {
                "name": "Southern Ijaw",
                "lgas": ["Southern Ijaw"]
            },
            {
                "name": "Yenagoa/Kolokuma/Opokuma",
                "lgas": ["Yenagoa", "Kolokuma/Opokuma"]
            }
        ]
    },
    {
        "state": "Benue",
        "total_constituencies": 11,
        "constituencies": [
            {
                "name": "Ado/Ogbadibo/Okpokwu",
                "lgas": ["Ado", "Ogbadibo", "Okpokwu"]
            },
            {
                "name": "Apa/Agatu",
                "lgas": ["Apa", "Agatu"]
            },
            {
                "name": "Buruku",
                "lgas": ["Buruku"]
            },
            {
                "name": "Gboko/Tarka",
                "lgas": ["Gboko", "Tarka"]
            },
            {
                "name": "Gwer East/Gwer West",
                "lgas": ["Gwer East", "Gwer West"]
            },
            {
                "name": "Katsina-Ala/Ukum/Logo",
                "lgas": ["Katsina-Ala", "Ukum", "Logo"]
            },
            {
                "name": "Konshisha/Vandeikya",
                "lgas": ["Konshisha", "Vandeikya"]
            },
            {
                "name": "Kwande/Ushongo",
                "lgas": ["Kwande", "Ushongo"]
            },
            {
                "name": "Makurdi/Guma",
                "lgas": ["Makurdi", "Guma"]
            },
            {
                "name": "Oju/Obi",
                "lgas": ["Oju", "Obi"]
            },
            {
                "name": "Otukpo/Ohimini",
                "lgas": ["Otukpo", "Ohimini"]
            }
        ]
    },
    {
        "state": "Borno",
        "total_constituencies": 10,
        "constituencies": [
            {
                "name": "Askira-Uba/Hawul",
                "lgas": ["Askira/Uba", "Hawul"]
            },
            {
                "name": "Bama/Ngala/Kala-Balge",
                "lgas": ["Bama", "Ngala", "Kala/Balge"]
            },
            {
                "name": "Biu/Kwaya-Kusar/Shani/Bayo",
                "lgas": ["Biu", "Kwaya Kusar", "Shani", "Bayo"]
            },
            {
                "name": "Damboa/Gwoza/Chibok",
                "lgas": ["Damboa", "Gwoza", "Chibok"]
            },
            {
                "name": "Dikwa/Mafa/Konduga",
                "lgas": ["Dikwa", "Mafa", "Konduga"]
            },
            {
                "name": "Gubio/Kaga/Magumeri",
                "lgas": ["Gubio", "Kaga", "Magumeri"]
            },
            {
                "name": "Jere",
                "lgas": ["Jere"]
            },
            {
                "name": "Kukawa/Mobbar/Abadam/Guzamala",
                "lgas": ["Kukawa", "Mobbar", "Abadam", "Guzamala"]
            },
            {
                "name": "Maiduguri (Metropolitan)",
                "lgas": ["Maiduguri"]
            },
            {
                "name": "Monguno/Marte/Nganzai",
                "lgas": ["Monguno", "Marte", "Nganzai"]
            }
        ]
    },
    {
        "state": "Cross River",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Akamkpa/Biase",
                "lgas": ["Akamkpa", "Biase"]
            },
            {
                "name": "Boki/Ikom",
                "lgas": ["Boki", "Ikom"]
            },
            {
                "name": "Calabar Municipal/Odukpani",
                "lgas": ["Calabar Municipality", "Odukpani"]
            },
            {
                "name": "Calabar South/Akpabuyo/Bakassi",
                "lgas": ["Calabar South", "Akpabuyo", "Bakassi"]
            },
            {
                "name": "Obanliku/Obudu/Bekwarra",
                "lgas": ["Obanliku", "Obudu", "Bekwarra"]
            },
            {
                "name": "Obubra/Etung",
                "lgas": ["Obubra", "Etung"]
            },
            {
                "name": "Ogoja/Yala",
                "lgas": ["Ogoja", "Yala"]
            },
            {
                "name": "Yakurr/Abi",
                "lgas": ["Yakurr", "Abi"]
            }
        ]
    },
    {
        "state": "Delta",
        "total_constituencies": 10,
        "constituencies": [
            {
                "name": "Aniocha North/Aniocha South/Oshimili North/Oshimili South",
                "lgas": ["Aniocha North", "Aniocha South", "Oshimili North", "Oshimili South"]
            },
            {
                "name": "Bomadi/Patani",
                "lgas": ["Bomadi", "Patani"]
            },
            {
                "name": "Burutu",
                "lgas": ["Burutu"]
            },
            {
                "name": "Ethiope East/Ethiope West",
                "lgas": ["Ethiope East", "Ethiope West"]
            },
            {
                "name": "Ika North East/Ika South",
                "lgas": ["Ika North East", "Ika South"]
            },
            {
                "name": "Isoko North/Isoko South",
                "lgas": ["Isoko North", "Isoko South"]
            },
            {
                "name": "Ndokwa East/Ndokwa West/Ukwuani",
                "lgas": ["Ndokwa East", "Ndokwa West", "Ukwuani"]
            },
            {
                "name": "Okpe/Sapele/Uvwie",
                "lgas": ["Okpe", "Sapele", "Uvwie"]
            },
            {
                "name": "Ughelli North/Ughelli South/Udu",
                "lgas": ["Ughelli North", "Ughelli South", "Udu"]
            },
            {
                "name": "Warri North/Warri South/Warri South West",
                "lgas": ["Warri North", "Warri South", "Warri South West"]
            }
        ]
    },
    {
        "state": "Ebonyi",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Abakaliki/Izzi",
                "lgas": ["Abakaliki", "Izzi"]
            },
            {
                "name": "Afikpo North/Afikpo South",
                "lgas": ["Afikpo North", "Afikpo South"]
            },
            {
                "name": "Ebonyi/Ohaukwu",
                "lgas": ["Ebonyi", "Ohaukwu"]
            },
            {
                "name": "Ezza North/Ishielu",
                "lgas": ["Ezza North", "Ishielu"]
            },
            {
                "name": "Ezza South/Ikwo",
                "lgas": ["Ezza South", "Ikwo"]
            },
            {
                "name": "Ohaozara/Onicha/Ivo",
                "lgas": ["Ohaozara", "Onicha", "Ivo"]
            }
        ]
    },
    {
        "state": "Edo",
        "total_constituencies": 9,
        "constituencies": [
            {
                "name": "Akoko-Edo",
                "lgas": ["Akoko-Edo"]
            },
            {
                "name": "Egor/Ikpoba-Okha",
                "lgas": ["Egor", "Ikpoba-Okha"]
            },
            {
                "name": "Esan Central/Esan West/Igueben",
                "lgas": ["Esan Central", "Esan West", "Igueben"]
            },
            {
                "name": "Esan North-East/Esan South-East",
                "lgas": ["Esan North-East", "Esan South-East"]
            },
            {
                "name": "Etsako East/Etsako West/Etsako Central",
                "lgas": ["Etsako East", "Etsako West", "Etsako Central"]
            },
            {
                "name": "Oredo",
                "lgas": ["Oredo"]
            },
            {
                "name": "Orhionmwon/Uhunmwonde",
                "lgas": ["Orhionmwon", "Uhunmwonde"]
            },
            {
                "name": "Ovia South-West/Ovia North-East",
                "lgas": ["Ovia South-West", "Ovia North-East"]
            },
            {
                "name": "Owan West/Owan East",
                "lgas": ["Owan West", "Owan East"]
            }
        ]
    },
    {
        "state": "Ekiti",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Ado Ekiti/Irepodun-Ifelodun",
                "lgas": ["Ado-Ekiti", "Iyin/Irepodun/Ifelodun"]
            },
            {
                "name": "Ekiti South-West/Ikere/Ise-Orun",
                "lgas": ["Ekiti South-West", "Ikere", "Ise/Orun"]
            },
            {
                "name": "Emure/Gbonyin/Ekiti East",
                "lgas": ["Emure", "Gbonyin", "Omuo/Ekiti East"]
            },
            {
                "name": "Ido-Osi/Moba/Ilejemeje",
                "lgas": ["Ido/Osi", "Moba", "Ilejemeje"]
            },
            {
                "name": "Ijero/Ekiti West/Efon",
                "lgas": ["Ijero", "Ekiti West", "Efon"]
            },
            {
                "name": "Ikole/Oye",
                "lgas": ["Ikole", "Iye"]
            }
        ]
    },
    {
        "state": "Enugu",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Aninri/Awgu/Oji-River",
                "lgas": ["Aninri", "Awgu", "Oji-River"]
            },
            {
                "name": "Enugu North/Enugu South",
                "lgas": ["Enugu North", "Enugu South"]
            },
            {
                "name": "Enugu East/Isi-Uzo",
                "lgas": ["Enugu East", "Isi-Uzo"]
            },
            {
                "name": "Ezeagu/Udi",
                "lgas": ["Ezeagu", "Udi"]
            },
            {
                "name": "Igbo-Etiti/Uzo-Uwani",
                "lgas": ["Igbo-Etiti", "Uzo-Uwani"]
            },
            {
                "name": "Igbo-Eze North/Udenu",
                "lgas": ["Igbo-Eze North", "Udenu"]
            },
            {
                "name": "Nkanu East/Nkanu West",
                "lgas": ["Nkanu East", "Nkanu West"]
            },
            {
                "name": "Nsukka/Igbo-Eze South",
                "lgas": ["Nsukka", "Igbo-Eze South"]
            }
        ]
    },
    {
        "state": "Gombe",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Akko",
                "lgas": ["Akko"]
            },
            {
                "name": "Balanga/Billiri",
                "lgas": ["Balanga", "Billiri"]
            },
            {
                "name": "Dukku/Nafada",
                "lgas": ["Dukku", "Nafada"]
            },
            {
                "name": "Gombe/Funakaye/Kwami",
                "lgas": ["Gombe", "Funakaye", "Kwami"]
            },
            {
                "name": "Kaltungo/Shongom",
                "lgas": ["Kaltungo", "Shongom"]
            },
            {
                "name": "Yamaltu/Deba",
                "lgas": ["Yamaltu/Deba"]
            }
        ]
    },
    {
        "state": "Imo",
        "total_constituencies": 10,
        "constituencies": [
            {
                "name": "Aboh Mbaise/Ngor Okpala",
                "lgas": ["Aboh Mbaise", "Ngor Okpala"]
            },
            {
                "name": "Ahiazu Mbaise/Ezinihitte",
                "lgas": ["Ahiazu Mbaise", "Ezinihitte"]
            },
            {
                "name": "Ideato North/Ideato South",
                "lgas": ["Ideato North", "Ideato South"]
            },
            {
                "name": "Isu/Njaba/Nkwerre/Nwangele",
                "lgas": ["Isu", "Njaba", "Nkwerre", "Nwangele"]
            },
            {
                "name": "Mbaitoli/Ikeduru",
                "lgas": ["Mbaitoli", "Ikeduru"]
            },
            {
                "name": "Okigwe North",
                "lgas": ["Isiala Mbano", "Onuimo", "Okigwe"]
            },
            {
                "name": "Okigwe South",
                "lgas": ["Ehime Mbano", "Ihitte/Uboma", "Obowo"]
            },
            {
                "name": "Orlu/Orsu/Oru East",
                "lgas": ["Orlu", "Orsu", "Oru East"]
            },
            {
                "name": "Oru West/Oguta/Ohaji-Egbema",
                "lgas": ["Oru West", "Oguta", "Ohaji/Egbema"]
            },
            {
                "name": "Owerri Municipal/Owerri North/Owerri West",
                "lgas": ["Owerri Municipal", "Owerri North", "Owerri West"]
            }
        ]
    },
    {
        "state": "Jigawa",
        "total_constituencies": 11,
        "constituencies": [
            {
                "name": "Babura/Garki",
                "lgas": ["Babura", "Garki"]
            },
            {
                "name": "Birnin Kudu/Buji",
                "lgas": ["Birnin Kudu", "Buji"]
            },
            {
                "name": "Birniwa/Guri/Kirikasamma",
                "lgas": ["Birniwa", "Guri", "Kirikasamma"]
            },
            {
                "name": "Dutse/Kiyawa",
                "lgas": ["Dutse", "Kiyawa"]
            },
            {
                "name": "Gumel/Maigatari/Sule Tankarkar/Gagarawa",
                "lgas": ["Gumel", "Maigatari", "Suletankarkar", "Gagarawa"]
            },
            {
                "name": "Gwaram",
                "lgas": ["Gwaram"]
            },
            {
                "name": "Hadejia/Auyo/Kafin Hausa",
                "lgas": ["Hadejia", "Auuyo", "Kafin Hausa"]
            },
            {
                "name": "Jahun/Miga",
                "lgas": ["Jahun", "Miga"]
            },
            {
                "name": "Kazaure/Roni/Gwiwa/Yankwashi",
                "lgas": ["Kazaure", "Roni", "Gwiwa", "Yankwashi"]
            },
            {
                "name": "Malam Madori/Kaugama",
                "lgas": ["Malam Madori", "Kaugama"]
            },
            {
                "name": "Ringim/Taura",
                "lgas": ["Ringim", "Taura"]
            }
        ]
    },
    {
        "state": "Kaduna",
        "total_constituencies": 16,
        "constituencies": [
            {
                "name": "Birnin Gwari/Giwa",
                "lgas": ["Birnin Gwari", "Giwa"]
            },
            {
                "name": "Chikun/Kajuru",
                "lgas": ["Chikun", "Kajuru"]
            },
            {
                "name": "Igabi",
                "lgas": ["Igabi"]
            },
            {
                "name": "Ikara/Kubau",
                "lgas": ["Ikara", "Kubau"]
            },
            {
                "name": "Jaba/Zangon Kataf",
                "lgas": ["Jaba", "Zangon Kataf"]
            },
            {
                "name": "Jema'a/Sanga",
                "lgas": ["Jema'a", "Sanga"]
            },
            {
                "name": "Kachia/Kagarko",
                "lgas": ["Kachia", "Kagarko"]
            },
            {
                "name": "Kaduna Central",
                "lgas": ["Kaduna North", "Kaduna South"]
            },
            {
                "name": "Kaura",
                "lgas": ["Kaura"]
            },
            {
                "name": "Kauru",
                "lgas": ["Kauru"]
            },
            {
                "name": "Lere",
                "lgas": ["Lere"]
            },
            {
                "name": "Makarfi/Kudan",
                "lgas": ["Makarfi", "Kudan"]
            },
            {
                "name": "Sabon Gari",
                "lgas": ["Sabon Gari"]
            },
            {
                "name": "Soba",
                "lgas": ["Soba"]
            },
            {
                "name": "Zaria",
                "lgas": ["Zaria"]
            }
        ]
    },
    {
        "state": "Kano",
        "total_constituencies": 24,
        "constituencies": [
            {
                "name": "Albasu/Gaya/Ajingi",
                "lgas": ["Albasu", "Gaya", "Ajingi"]
            },
            {
                "name": "Bagwai/Shanono",
                "lgas": ["Bagwai", "Shanono"]
            },
            {
                "name": "Bebeji/Kiru",
                "lgas": ["Bebeji", "Kiru"]
            },
            {
                "name": "Bichi",
                "lgas": ["Bichi"]
            },
            {
                "name": "Bunkure/Rano/Kibiya",
                "lgas": ["Bunkure", "Rano", "Kibiya"]
            },
            {
                "name": "Dala",
                "lgas": ["Dala"]
            },
            {
                "name": "Dambatta/Makoda",
                "lgas": ["Dambatta", "Makoda"]
            },
            {
                "name": "Dawakin Kudu/Warawa",
                "lgas": ["Dawakin Kudu", "Warawa"]
            },
            {
                "name": "Dawakin Tofa/Tofa/Rimin Gado",
                "lgas": ["Dawakin Tofa", "Tofa", "Rimin Gado"]
            },
            {
                "name": "Doguwa/Tudun Wada",
                "lgas": ["Doguwa", "Tudun Wada"]
            },
            {
                "name": "Fagge",
                "lgas": ["Fagge"]
            },
            {
                "name": "Gabasawa/Gezawa",
                "lgas": ["Gabasawa", "Gezawa"]
            },
            {
                "name": "Gwale",
                "lgas": ["Gwale"]
            },
            {
                "name": "Gwarzo/Kabo",
                "lgas": ["Gwarzo", "Kabò"]
            },
            {
                "name": "Kano Municipal",
                "lgas": ["Kano Municipal"]
            },
            {
                "name": "Karaye/Rogo",
                "lgas": ["Karaye", "Rogo"]
            },
            {
                "name": "Kumbotso",
                "lgas": ["Kumbotso"]
            },
            {
                "name": "Kunchi/Tsanyawa",
                "lgas": ["Kunchi", "Tsanyawa"]
            },
            {
                "name": "Kura/Madobi/Garun Mallam",
                "lgas": ["Kura", "Madobi", "Garun Mallam"]
            },
            {
                "name": "Minjibir/Ungogo",
                "lgas": ["Minjibir", "Ungogo"]
            },
            {
                "name": "Nasarawa",
                "lgas": ["Nasarawa"]
            },
            {
                "name": "Sumaila/Takai",
                "lgas": ["Sumaila", "Takai"]
            },
            {
                "name": "Tarauni",
                "lgas": ["Tarauni"]
            },
            {
                "name": "Wudil/Garko",
                "lgas": ["Wudil", "Garko"]
            }
        ]
    },
    {
        "state": "Katsina",
        "total_constituencies": 15,
        "constituencies": [
            {
                "name": "Bakori/Danja",
                "lgas": ["Bakori", "Danja"]
            },
            {
                "name": "Batagarawa/Charanchi/Rimi",
                "lgas": ["Batagarawa", "Charanchi", "Rimi"]
            },
            {
                "name": "Batsari/Safana/Dan Musa",
                "lgas": ["Batsari", "Safana", "DanMusa"]
            },
            {
                "name": "Daura/Sandamu/Mai'Adua",
                "lgas": ["Daura", "Sandamu", "Mai'Adua"]
            },
            {
                "name": "Dutsin-Ma/Kurfi",
                "lgas": ["Dutsin-Ma", "Kurfi"]
            },
            {
                "name": "Funtua/Dandume",
                "lgas": ["Funtua", "Dandume"]
            },
            {
                "name": "Faskari/Kankara/Sabuwa",
                "lgas": ["Faskari", "Kankara", "Sabuwa"]
            },
            {
                "name": "Jibia/Kaita",
                "lgas": ["Jibia", "Kaita"]
            },
            {
                "name": "Kankia/Ingawa/Kusada",
                "lgas": ["Kankia", "Ingawa", "Kusada"]
            },
            {
                "name": "Katsina Central",
                "lgas": ["Katsina"]
            },
            {
                "name": "Malumfashi/Kafur",
                "lgas": ["Malumfashi", "Kafur"]
            },
            {
                "name": "Mani/Bindawa",
                "lgas": ["Mani", "Bindawa"]
            },
            {
                "name": "Mashi/Dutsi",
                "lgas": ["Mashi", "Dutsi"]
            },
            {
                "name": "Matazu/Musawa",
                "lgas": ["Matazu", "Musawa"]
            },
            {
                "name": "Zango/Baure",
                "lgas": ["Zango", "Baure"]
            }
        ]
    },
    {
        "state": "Kebbi",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Aleiro/Gwandu/Jega",
                "lgas": ["Aliero", "Gwandu", "Jega"]
            },
            {
                "name": "Argungu/Augie",
                "lgas": ["Argungu", "Augie"]
            },
            {
                "name": "Bagudo/Suru",
                "lgas": ["Bagudo", "Suru"]
            },
            {
                "name": "Birnin Kebbi/Kalgo/Bunza",
                "lgas": ["Birnin Kebbi", "Kalgo", "Bunza"]
            },
            {
                "name": "Dandi/Arewa",
                "lgas": ["Dandi", "Arewa Dandi"]
            },
            {
                "name": "Maiyama/Koko-Besse",
                "lgas": ["Maiyama", "Koko/Besse"]
            },
            {
                "name": "Ngaski/Shanga/Yauri",
                "lgas": ["Ngaski", "Shanga", "Yauri"]
            },
            {
                "name": "Zuru/Fakai/Sakaba/Danko-Wasagu",
                "lgas": ["Zuru", "Fakai", "Sakaba", "Danko/Wasagu"]
            }
        ]
    },
    {
        "state": "Kogi",
        "total_constituencies": 9,
        "constituencies": [
            {
                "name": "Adavi/Okehi",
                "lgas": ["Adavi", "Okehi"]
            },
            {
                "name": "Ajaokuta",
                "lgas": ["Ajaokuta"]
            },
            {
                "name": "Ankpa/Omala/Olamaboro",
                "lgas": ["Ankpa", "Omala", "Olamaboro"]
            },
            {
                "name": "Bassa/Dekina",
                "lgas": ["Bassa", "Dekina"]
            },
            {
                "name": "Idah/Ibaji/Igalamela-Odolu/Ofu",
                "lgas": ["Idah", "Ibaji", "Igalamela-Odolu", "Ofu"]
            },
            {
                "name": "Kabba-Bunu/Ijumu",
                "lgas": ["Kabba/Bunu", "Ijumu"]
            },
            {
                "name": "Lokoja/Kogi",
                "lgas": ["Lokoja", "Kogi"]
            },
            {
                "name": "Okene/Ogori-Magongo",
                "lgas": ["Okene", "Ogori/Magongo"]
            },
            {
                "name": "Yagba East/Yagba West/Mopa-Muro",
                "lgas": ["Yagba East", "Yagba West", "Mopa-Muro"]
            }
        ]
    },
    {
        "state": "Kwara",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Asa/Ilorin West",
                "lgas": ["Asa", "Ilorin West"]
            },
            {
                "name": "Baruten/Kaiama",
                "lgas": ["Baruten", "Kaiama"]
            },
            {
                "name": "Edu/Moro/Pategi",
                "lgas": ["Edu", "Moro", "Pategi"]
            },
            {
                "name": "Ilorin East/Ilorin South",
                "lgas": ["Ilorin East", "Ilorin South"]
            },
            {
                "name": "Ekiti/Isin/Irepodun/Oke-Ero",
                "lgas": ["Ekiti", "Isin", "Irepodun", "Oke Ero"]
            },
            {
                "name": "Ifelodun/Offa/Oyun",
                "lgas": ["Ifelodun", "Offa", "Oyun"]
            }
        ]
    },
    {
        "state": "Lagos",
        "total_constituencies": 24,
        "constituencies": [
            {
                "name": "Agege",
                "lgas": ["Agege"]
            },
            {
                "name": "Ajeromi-Ifelodun",
                "lgas": ["Ajeromi-Ifelodun"]
            },
            {
                "name": "Alimosho",
                "lgas": ["Alimosho"]
            },
            {
                "name": "Amuwo-Odofin",
                "lgas": ["Amuwo-Odofin"]
            },
            {
                "name": "Apapa",
                "lgas": ["Apapa"]
            },
            {
                "name": "Badagry",
                "lgas": ["Badagry"]
            },
            {
                "name": "Epe",
                "lgas": ["Epe"]
            },
            {
                "name": "Eti-Osa",
                "lgas": ["Eti-Osa"]
            },
            {
                "name": "Ibeju-Lekki",
                "lgas": ["Ibeju-Lekki"]
            },
            {
                "name": "Ifako-Ijaiye",
                "lgas": ["Ifako-Ijaiye"]
            },
            {
                "name": "Ikeja",
                "lgas": ["Ikeja"]
            },
            {
                "name": "Ikorodu",
                "lgas": ["Ikorodu"]
            },
            {
                "name": "Kosofe",
                "lgas": ["Kosofe"]
            },
            {
                "name": "Lagos Island I",
                "lgas": ["Lagos Island"]
            },
            {
                "name": "Lagos Island II",
                "lgas": ["Lagos Island"]
            },
            {
                "name": "Lagos Mainland",
                "lgas": ["Lagos Mainland"]
            },
            {
                "name": "Mushin I",
                "lgas": ["Mushin"]
            },
            {
                "name": "Mushin II",
                "lgas": ["Mushin"]
            },
            {
                "name": "Ojo",
                "lgas": ["Ojo"]
            },
            {
                "name": "Oshodi-Isolo I",
                "lgas": ["Oshodi-Isolo"]
            },
            {
                "name": "Oshodi-Isolo II",
                "lgas": ["Oshodi-Isolo"]
            },
            {
                "name": "Shomolu",
                "lgas": ["Shomolu"]
            },
            {
                "name": "Surulere I",
                "lgas": ["Surulere"]
            },
            {
                "name": "Surulere II",
                "lgas": ["Surulere"]
            }
        ]
    },
    {
        "state": "Nasarawa",
        "total_constituencies": 5,
        "constituencies": [
            {
                "name": "Akwanga/Wamba/Nasarawa Eggon",
                "lgas": ["Akwanga", "Wamba", "Nasarawa Eggon"]
            },
            {
                "name": "Awe/Doma/Keana",
                "lgas": ["Awe", "Doma", "Keana"]
            },
            {
                "name": "Karu/Keffi/Kokona",
                "lgas": ["Karu", "Keffi", "Kokona"]
            },
            {
                "name": "Lafia/Obi",
                "lgas": ["Lafia", "Obi"]
            },
            {
                "name": "Nasarawa/Toto",
                "lgas": ["Nasarawa", "Toto"]
            }
        ]
    },
    {
        "state": "Niger",
        "total_constituencies": 10,
        "constituencies": [
            {
                "name": "Agaie/Lapai",
                "lgas": ["Agaie", "Lapai"]
            },
            {
                "name": "Agwara/Borgu",
                "lgas": ["Agwara", "Borgu"]
            },
            {
                "name": "Bida/Gbako/Katcha",
                "lgas": ["Bida", "Gbako", "Katcha"]
            },
            {
                "name": "Bosso/Paikoro",
                "lgas": ["Bosso", "Paikoro"]
            },
            {
                "name": "Chanchaga",
                "lgas": ["Chanchaga"]
            },
            {
                "name": "Gurara/Suleja/Tafa",
                "lgas": ["Gurara", "Suleja", "Tafa"]
            },
            {
                "name": "Kontagora/Wushishi/Mariga/Mashegu",
                "lgas": ["Kontagora", "Wushishi", "Mariga", "Mashegu"]
            },
            {
                "name": "Lavun/Mokwa/Edati",
                "lgas": ["Lavun", "Mokwa", "Edati"]
            },
            {
                "name": "Magama/Rijau",
                "lgas": ["Magama", "Rijau"]
            },
            {
                "name": "Rafi/Shiroro/Munya",
                "lgas": ["Rafi", "Shiroro", "Munya"]
            }
        ]
    },
    {
        "state": "Ogun",
        "total_constituencies": 9,
        "constituencies": [
            {
                "name": "Abeokuta North/Obafemi-Owode/Odeda",
                "lgas": ["Abeokuta North", "Obafemi Owode", "Odeda"]
            },
            {
                "name": "Abeokuta South",
                "lgas": ["Abeokuta South"]
            },
            {
                "name": "Ado-Odo/Ota",
                "lgas": ["Ado-Odo/Ota"]
            },
            {
                "name": "Ewekoro/Ifo",
                "lgas": ["Ewekoro", "Ifo"]
            },
            {
                "name": "Ijebu Ode/Odogbolu/Ijebu North East",
                "lgas": ["Ijebu Ode", "Odogbolu", "Ijebu North East"]
            },
            {
                "name": "Ijebu North/Ijebu East/Ikenne",
                "lgas": ["Ijebu North", "Ijebu East", "Ikenne"]
            },
            {
                "name": "Ikenne/Remo North/Sagamu",
                "lgas": ["Ikenne", "Remo North", "Sagamu"]
            },
            {
                "name": "Imeko Afon/Yewa North",
                "lgas": ["Imeko Afon", "Yewa North"]
            },
            {
                "name": "Ipokia/Yewa South",
                "lgas": ["Ipokia", "Yewa South"]
            }
        ]
    },
    {
        "state": "Ondo",
        "total_constituencies": 9,
        "constituencies": [
            {
                "name": "Akoko North-East/Akoko North-West",
                "lgas": ["Akoko North-East", "Akoko North-West"]
            },
            {
                "name": "Akoko South-East/Akoko South-West",
                "lgas": ["Akoko South-East", "Akoko South-West"]
            },
            {
                "name": "Akure North/Akure South",
                "lgas": ["Akure North", "Akure South"]
            },
            {
                "name": "Idanre/Ifedore",
                "lgas": ["Idanre", "Ifedore"]
            },
            {
                "name": "Ilaje/Ese-Odo",
                "lgas": ["Ilaje", "Ese Odo"]
            },
            {
                "name": "Ile-Oluji-Okeigbo/Odigbo",
                "lgas": ["Ile Oluji/Okeigbo", "Odigbo"]
            },
            {
                "name": "Okitipupa/Irele",
                "lgas": ["Okitipupa", "Irele"]
            },
            {
                "name": "Ondo East/Ondo West",
                "lgas": ["Ondo East", "Ondo West"]
            },
            {
                "name": "Owo/Ose",
                "lgas": ["Owo", "Ose"]
            }
        ]
    },
    {
        "state": "Osun",
        "total_constituencies": 9,
        "constituencies": [
            {
                "name": "Atakunmosa East/Atakunmosa West/Ilesa East/Ilesa West",
                "lgas": ["Atakunmosa East", "Atakunmosa West", "Ilesa East", "Ilesa West"]
            },
            {
                "name": "Ayedaade/Irewole/Isokan",
                "lgas": ["Ayedaade", "Irewole", "Isokan"]
            },
            {
                "name": "Ayedire/Iwo/Ola-Oluwa",
                "lgas": ["Ayedire", "Iwo", "Ola Oluwa"]
            },
            {
                "name": "Boluwaduro/Ifedayo/Ila",
                "lgas": ["Boluwaduro", "Ifedayo", "Ila"]
            },
            {
                "name": "Ede North/Ede South/Egbedore/Ejigbo",
                "lgas": ["Ede North", "Ede South", "Egbedore", "Ejigbo"]
            },
            {
                "name": "Ife Central/Ife East/Ife North/Ife South",
                "lgas": ["Ife Central", "Ife East", "Ife North", "Ife South"]
            },
            {
                "name": "Ifelodun/Boripe/Odo-Otin",
                "lgas": ["Ifelodun", "Boripe", "Odo Otin"]
            },
            {
                "name": "Irepodun/Olorunda/Osogbo/Orolu",
                "lgas": ["Irepodun", "Olorunda", "Osogbo", "Orolu"]
            },
            {
                "name": "Obokun/Oriade",
                "lgas": ["Obokun", "Oriade"]
            }
        ]
    },
    {
        "state": "Oyo",
        "total_constituencies": 14,
        "constituencies": [
            {
                "name": "Afijio/Atiba/Oyo East/Oyo West",
                "lgas": ["Afijio", "Atiba", "Oyo East", "Oyo West"]
            },
            {
                "name": "Akinyele/Lagelu",
                "lgas": ["Akinyele", "Lagelu"]
            },
            {
                "name": "Atisbo/Saki East/Saki West",
                "lgas": ["Atisbo", "Saki East", "Saki West"]
            },
            {
                "name": "Egbeda/Ona-Ara",
                "lgas": ["Egbeda", "Ona Ara"]
            },
            {
                "name": "Ibadan North",
                "lgas": ["Ibadan North"]
            },
            {
                "name": "Ibadan North East/Ibadan South East",
                "lgas": ["Ibadan North-East", "Ibadan South-East"]
            },
            {
                "name": "Ibadan North West/Ibadan South West",
                "lgas": ["Ibadan North-West", "Ibadan South-West"]
            },
            {
                "name": "Ibarapa Central/Ibarapa North",
                "lgas": ["Ibarapa Central", "Ibarapa North"]
            },
            {
                "name": "Ibarapa East/Ido",
                "lgas": ["Ibarapa East", "Ido"]
            },
            {
                "name": "Iseyin/Itesiwaju/Kajola/Iwajowa",
                "lgas": ["Iseyin", "Itesiwaju", "Kajola", "Iwajowa"]
            },
            {
                "name": "Ogbomoso North/Ogbomoso South/Oriire",
                "lgas": ["Ogbomoso North", "Ogbomoso South", "Oriire"]
            },
            {
                "name": "Ogo-Oluwa/Surulere",
                "lgas": ["Ogo Oluwa", "Surulere"]
            },
            {
                "name": "Olorunsogo/Orelope/Irepo",
                "lgas": ["Olorunsogo", "Oorelope", "Irepo"]
            },
            {
                "name": "Oluyole",
                "lgas": ["Oluyole"]
            }
        ]
    },
    {
        "state": "Plateau",
        "total_constituencies": 8,
        "constituencies": [
            {
                "name": "Barkin Ladi/Riyom",
                "lgas": ["Barkin Ladi", "Riyom"]
            },
            {
                "name": "Bokkos/Mangu",
                "lgas": ["Bokkos", "Mangu"]
            },
            {
                "name": "Jos North/Bassa",
                "lgas": ["Jos North", "Bassa"]
            },
            {
                "name": "Jos South/Jos East",
                "lgas": ["Jos South", "Jos East"]
            },
            {
                "name": "Kanam/Pankshin/Kanke",
                "lgas": ["Kanam", "Pankshin", "Kanke"]
            },
            {
                "name": "Langtang North/Langtang South",
                "lgas": ["Langtang North", "Langtang South"]
            },
            {
                "name": "Mikang/Qua'an Pan/Shendam",
                "lgas": ["Mikang", "Qua'an Pan", "Shendam"]
            },
            {
                "name": "Wase",
                "lgas": ["Wase"]
            }
        ]
    },
    {
        "state": "Rivers",
        "total_constituencies": 13,
        "constituencies": [
            {
                "name": "Abua-Odual/Ahoada East",
                "lgas": ["Abua/Odual", "Ahoada East"]
            },
            {
                "name": "Ahoada West/Ogba-Egbema-Ndoni",
                "lgas": ["Ahoada West", "Ogba/Egbema/Ndoni"]
            },
            {
                "name": "Akuku Toru/Asari Toru",
                "lgas": ["Akuku-Toru", "Asari-Toru"]
            },
            {
                "name": "Andoni/Opobo-Nkoro",
                "lgas": ["Andoni", "Opobo/Nkoro"]
            },
            {
                "name": "Degema/Bonny",
                "lgas": ["Degema", "Bonny"]
            },
            {
                "name": "Eleme/Oyigbo/Tai",
                "lgas": ["Eleme", "Oyigbo", "Tai"]
            },
            {
                "name": "Etche/Omuma",
                "lgas": ["Etche", "Omuma"]
            },
            {
                "name": "Gokana/Khana",
                "lgas": ["Gokana", "Khana"]
            },
            {
                "name": "Ikwerre/Emohua",
                "lgas": ["Ikwerre", "Emohua"]
            },
            {
                "name": "Obio/Akpor",
                "lgas": ["Obio/Akpor"]
            },
            {
                "name": "Okrika/Ogu-Bolo",
                "lgas": ["Okrika", "Ogu/Bolo"]
            },
            {
                "name": "Port Harcourt I",
                "lgas": ["Port Harcourt"]
            },
            {
                "name": "Port Harcourt II",
                "lgas": ["Port Harcourt"]
            }
        ]
    },
    {
        "state": "Sokoto",
        "total_constituencies": 11,
        "constituencies": [
            {
                "name": "Binji/Silame",
                "lgas": ["Binji", "Silame"]
            },
            {
                "name": "Dange-Shuni/Bodinga/Tureta",
                "lgas": ["Dange Shuni", "Bodinga", "Tureta"]
            },
            {
                "name": "Gada/Goronyo",
                "lgas": ["Gada", "Goronyo"]
            },
            {
                "name": "Gwadabawa/Illela",
                "lgas": ["Gwadabawa", "Illela"]
            },
            {
                "name": "Isa/Sabon Birni",
                "lgas": ["Isa", "Sabon Birni"]
            },
            {
                "name": "Kebbe/Tambuwal",
                "lgas": ["Kebbe", "Tambuwal"]
            },
            {
                "name": "Kware/Wamakko",
                "lgas": ["Kware", "Wamako"]
            },
            {
                "name": "Sokoto North/Sokoto South",
                "lgas": ["Sokoto North", "Sokoto South"]
            },
            {
                "name": "Tangaza/Gudu",
                "lgas": ["Tangaza", "Gudu"]
            },
            {
                "name": "Wurno/Rabah",
                "lgas": ["Wurno", "Rabah"]
            },
            {
                "name": "Yabo/Shagari",
                "lgas": ["Yabo", "Shagari"]
            }
        ]
    },
    {
        "state": "Taraba",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Bali/Gassol",
                "lgas": ["Bali", "Gassol"]
            },
            {
                "name": "Donga/Ussa/Takum",
                "lgas": ["Donga", "Ussa", "Takum"]
            },
            {
                "name": "Gashaka/Kurmi/Sardauna",
                "lgas": ["Gashaka", "Kurmi", "Sardauna"]
            },
            {
                "name": "Jalingo/Yorro/Zing",
                "lgas": ["Jalingo", "Yorro", "Zing"]
            },
            {
                "name": "Karim Lamido/Lau/Ardo-Kola",
                "lgas": ["Karim Lamido", "Lau", "Ardo Kola"]
            },
            {
                "name": "Wukari/Ibi",
                "lgas": ["Wukari", "Ibi"]
            }
        ]
    },
    {
        "state": "Yobe",
        "total_constituencies": 6,
        "constituencies": [
            {
                "name": "Bade/Jakusko",
                "lgas": ["Bade", "Jakusko"]
            },
            {
                "name": "Bursari/Geidam/Yunusari",
                "lgas": ["Bursari", "Geidam", "Yunusari"]
            },
            {
                "name": "Damaturu/Gujba/Gulani/Tarmuwa",
                "lgas": ["Damaturu", "Gujba", "Gulani", "Tarmuwa"]
            },
            {
                "name": "Fika/Fune",
                "lgas": ["Fika", "Fune"]
            },
            {
                "name": "Machina/Nguru/Yusufari/Karasuwa",
                "lgas": ["Machina", "Nguru", "Yusufari", "Karasuwa"]
            },
            {
                "name": "Nangere/Potiskum",
                "lgas": ["Nangere", "Potiskum"]
            }
        ]
    },
    {
        "state": "Zamfara",
        "total_constituencies": 7,
        "constituencies": [
            {
                "name": "Anka/Talata Mafara",
                "lgas": ["Anka", "Talata Mafara"]
            },
            {
                "name": "Bakura/Maradun",
                "lgas": ["Bakura", "Maradun"]
            },
            {
                "name": "Bungudu/Maru",
                "lgas": ["Bungudu", "Maru"]
            },
            {
                "name": "Gunmi/Bukkuyum",
                "lgas": ["Gummi", "Bukkuyum"]
            },
            {
                "name": "Gusau/Tsafe",
                "lgas": ["Gusau", "Tsafe"]
            },
            {
                "name": "Kaura Namoda/Birnin Magaji",
                "lgas": ["Kaura Namoda", "Birnin Magaji/Kiyaw"]
            },
            {
                "name": "Shinkafi/Zurmi",
                "lgas": ["Shinkafi", "Zurmi"]
            }
        ]
    },
    {
        "state": "Federal Capital Territory",
        "total_constituencies": 2,
        "constituencies": [
            {
                "name": "Abaji/Gwagwalada/Kuje/Kwali",
                "lgas": ["Abaji", "Gwagwalada", "Kuje", "Kwali"]
            },
            {
                "name": "Abuja Municipal/Bwari",
                "lgas": ["Abuja Municipal", "Bwari"]
            }
        ]
    }
]

// Helper function to read a specific state file dynamically from the server filesystem
function getStateElectoralData(stateName) {
    try {
        const fileName = `${stateName.toLowerCase()}.json`;
        const filePath = path.join(process.cwd(), 'data', fileName);

        if (!fs.existsSync(filePath)) {
            console.error(`State file not found at path: ${filePath}`);
            return null;
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Server Filesystem Read Error for state [${stateName}]:`, error);
        return null;
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const targetState = searchParams.get('state')?.trim();
    let targetLga = searchParams.get('lga')?.trim();
    const targetWard = searchParams.get('ward')?.trim();
    const isAll = searchParams.get('all') === 'true';

    // Extract the macro boundaries from the query parameters
    const targetSenatorialDistrict = searchParams.get('senatorial_district')?.trim();
    const targetFedConstituency = searchParams.get('fed_constituency')?.trim();
    const targetStateConstituency = searchParams.get('state_constituency')?.trim();

    // 1. If no state is specified, return the master list with corrected sorting and INEC numbering codes
    if (!targetState) {
        const masterStatesList = [
            { name: "ABIA", code: "01" }, { name: "ADAMAWA", code: "02" }, { name: "AKWA-IBOM", code: "03" },
            { name: "ANAMBRA", code: "04" }, { name: "BAUCHI", code: "05" }, { name: "BAYELSA", code: "06" },
            { name: "BENUE", code: "07" }, { name: "BORNO", code: "08" }, { name: "CROSS RIVER", code: "09" },
            { name: "DELTA", code: "10" }, { name: "EBONYI", code: "11" }, { name: "EDO", code: "12" },
            { name: "EKITI", code: "13" }, { name: "ENUGU", code: "14" }, { name: "GOMBE", code: "15" },
            { name: "IMO", code: "16" }, { name: "JIGAWA", code: "17" }, { name: "KADUNA", code: "18" },
            { name: "KANO", code: "19" }, { name: "KATSINA", code: "20" }, { name: "KEBBI", code: "21" },
            { name: "KOGI", code: "22" }, { name: "KWARA", code: "23" }, { name: "LAGOS", code: "24" },
            { name: "NASARAWA", code: "25" }, { name: "NIGER", code: "26" }, { name: "OGUN", code: "27" },
            { name: "ONDO", code: "28" }, { name: "OSUN", code: "29" }, { name: "OYO", code: "30" },
            { name: "PLATEAU", code: "31" }, { name: "RIVERS", code: "32" }, { name: "SOKOTO", code: "33" },
            { name: "TARABA", code: "34" }, { name: "YOBE", code: "35" }, { name: "ZAMFARA", code: "36" },
            { name: "FCT", code: "37" }
        ];
        return NextResponse.json({ states: masterStatesList });
    }

    // Load specific state data from its dedicated JSON file
    const fileData = getStateElectoralData(targetState);
    if (!fileData || !fileData.state) {
        return NextResponse.json({ error: `Electoral matrix for ${targetState} is currently unavailable` }, { status: 404 });
    }

    const stateWrapper = fileData.state;
    const normalizedStateKey = normalizeString(targetState);

    // =========================================================================
    // DIRECT WARD INTERCEPT: Allows a Ward Supervisor to look up a ward without an LGA
    // =========================================================================
    if (targetWard && !targetLga) {
        const normalizedSearchWard = normalizeString(targetWard);
        let foundLgaMatch = null;
        let foundWardMatch = null;

        // Iterate across all LGAs in the state wrapper to find where this ward lives
        for (const currentLga of (stateWrapper.lgas || [])) {
            let match = (currentLga.wards || []).find(w => normalizeString(w.name) === normalizedSearchWard);

            if (!match) {
                match = (currentLga.wards || []).find(w =>
                    normalizeString(w.name).includes(normalizedSearchWard) ||
                    normalizedSearchWard.includes(normalizeString(w.name))
                );
            }

            if (match) {
                foundLgaMatch = currentLga;
                foundWardMatch = match;
                break; // Found the matching structure anchor, break loop execution
            }
        }

        if (!foundWardMatch || !foundLgaMatch) {
            return NextResponse.json({ error: `Specified Ward branch [${targetWard}] could not be found anywhere inside ${targetState} State` }, { status: 404 });
        }

        // Map and extract the leaf polling unit entries embedded inside the discovered structural ward
        const pollingUnitsList = (foundWardMatch.pollingUnits || []).map(pu => ({
            id: pu.id,
            name: pu.name,
            code: pu.delimitation || pu.units || pu.abbreviation, // fallback sequence matching frontend rendering requirements
            delimitation: pu.delimitation,
            remark: pu.remark,
            abbreviation: pu.abbreviation
        }));

        return NextResponse.json({
            lga: foundLgaMatch.name,
            ward: foundWardMatch.name,
            pollingUnits: pollingUnitsList
        });
    }

    // Dynamic resolution setups for global mapping boundaries
    // Note: Ensuring global maps are safely guarded against undefined states
    const stateSenatorialBoundaries = (typeof SENATORIAL_DISTRICTS_MAP !== 'undefined' && SENATORIAL_DISTRICTS_MAP[normalizedStateKey.toUpperCase()]) || [];

    let stateGreenChamberBoundaries = [];
    if (typeof GREEN_CHAMBER_MAP !== 'undefined') {
        const matchedGreenChamberState = GREEN_CHAMBER_MAP.find(s => normalizeString(s.state) === normalizedStateKey);
        stateGreenChamberBoundaries = matchedGreenChamberState ? matchedGreenChamberState.constituencies : [];
    }

    let rawStateHouseBoundaries = [];
    if (typeof STATE_DISTRICTS_MAP !== 'undefined') {
        const stateConstituencyKey = Object.keys(STATE_DISTRICTS_MAP).find(k => normalizeString(k) === normalizedStateKey);
        rawStateHouseBoundaries = stateConstituencyKey ? STATE_DISTRICTS_MAP[stateConstituencyKey] : [];
    }

    const stateHouseBoundaries = rawStateHouseBoundaries.map(item => ({
        name: item.district,
        lga: item.lga,
        sen_district: item.sen_district
    }));

    // INTERCEPT: If an explicit state constituency query was submitted, intercept and calibrate the target LGA fallback
    if (targetStateConstituency && !targetLga) {
        const constituencyMatch = stateHouseBoundaries.find(
            c => normalizeString(c.name) === normalizeString(targetStateConstituency)
        );
        if (constituencyMatch && constituencyMatch.lga) {
            targetLga = constituencyMatch.lga;
        }
    }

    // 2. If no LGA parameter is resolved or explicitly specified, return filtered list matrices options
    if (!targetLga) {
        let lgasList = stateWrapper.lgas.map(lga => {
            if (isAll) {
                // Deeply map all child Wards and their deep Polling Units
                const fullyMappedWards = (lga.wards || []).map(ward => ({
                    id: ward.id,
                    name: ward.name,
                    abbreviation: ward.abbreviation,
                    puCount: ward.pollingUnits ? ward.pollingUnits.length : 0,
                    pollingUnits: (ward.pollingUnits || []).map(pu => ({
                        id: pu.id,
                        name: pu.name,
                        code: pu.delimitation || pu.units || pu.abbreviation,
                        delimitation: pu.delimitation,
                        remark: pu.remark,
                        abbreviation: pu.abbreviation
                    }))
                }));

                const combinedPuCount = fullyMappedWards.reduce((acc, currentWard) => acc + currentWard.puCount, 0);

                return {
                    id: lga.id,
                    name: lga.name,
                    abbreviation: lga.abbreviation,
                    wardCount: fullyMappedWards.length,
                    puCount: combinedPuCount,
                    wards: fullyMappedWards
                };
            } else {
                // Aggregate all polling units from across this LGA's nested wards
                const combinedPuCount = lga.wards
                    ? lga.wards.reduce((acc, currentWard) => acc + (currentWard.pollingUnits ? currentWard.pollingUnits.length : 0), 0)
                    : 0;

                return {
                    id: lga.id,
                    name: lga.name,
                    abbreviation: lga.abbreviation,
                    wardCount: lga.wards ? lga.wards.length : 0,
                    puCount: combinedPuCount
                };
            }
        });

        // Filter LGAs if a specific senatorial district was requested
        if (targetSenatorialDistrict) {
            const districtData = stateSenatorialBoundaries.find(
                d => normalizeString(d.name) === normalizeString(targetSenatorialDistrict)
            );

            if (districtData && districtData.lgas) {
                const validLgaNames = districtData.lgas.map(lga => normalizeString(lga));
                lgasList = lgasList.filter(lga => validLgaNames.includes(normalizeString(lga.name)));
            } else {
                lgasList = [];
            }
        }
        // Filter LGAs if a specific federal constituency was requested
        else if (targetFedConstituency) {
            const constituencyData = stateGreenChamberBoundaries.find(
                c => normalizeString(c.name) === normalizeString(targetFedConstituency)
            );

            if (constituencyData && constituencyData.lgas) {
                const validLgaNames = constituencyData.lgas.map(lga => normalizeString(lga));
                lgasList = lgasList.filter(lga => validLgaNames.includes(normalizeString(lga.name)));
            } else {
                lgasList = [];
            }
        }
        // Filter LGAs if a specific state constituency was requested
        else if (targetStateConstituency) {
            const constituencyMatch = stateHouseBoundaries.find(
                c => normalizeString(c.name) === normalizeString(targetStateConstituency)
            );

            if (constituencyMatch && constituencyMatch.lga) {
                const targetLgaNormalized = normalizeString(constituencyMatch.lga);
                lgasList = lgasList.filter(lga => normalizeString(lga.name) === targetLgaNormalized);
            } else {
                lgasList = [];
            }
        }

        return NextResponse.json({
            lgas: lgasList,
            senatorial_districts: stateSenatorialBoundaries.length > 0 ? stateSenatorialBoundaries : (stateWrapper.senatorial_districts || []),
            fed_constituencies: stateGreenChamberBoundaries.length > 0 ? stateGreenChamberBoundaries : (stateWrapper.fed_constituencies || []),
            state_constituencies: stateHouseBoundaries
        });
    }

    // 3. If target LGA is determined, safely isolate territory profile data and fallback resolve structure matches
    const normalizedSearchLga = normalizeString(targetLga);

    // Loosened fallback lookup: try exact structural matching, then fallback to sub-string containment checks to avoid strict format 404 bugs
    let lgaMatch = stateWrapper.lgas.find(l => normalizeString(l.name) === normalizedSearchLga);
    if (!lgaMatch) {
        lgaMatch = stateWrapper.lgas.find(l =>
            normalizeString(l.name).includes(normalizedSearchLga) ||
            normalizedSearchLga.includes(normalizeString(l.name))
        );
    }

    if (!lgaMatch) {
        return NextResponse.json({ error: `Specified LGA territory [${targetLga}] not found in ${targetState}` }, { status: 404 });
    }

    // STANDARD INTERCEPT: Used when both LGA and Ward are explicitly supplied
    if (targetWard) {
        const normalizedSearchWard = normalizeString(targetWard);
        let wardMatch = (lgaMatch.wards || []).find(w => normalizeString(w.name) === normalizedSearchWard);

        if (!wardMatch) {
            wardMatch = (lgaMatch.wards || []).find(w =>
                normalizeString(w.name).includes(normalizedSearchWard) ||
                normalizedSearchWard.includes(normalizeString(w.name))
            );
        }

        if (!wardMatch) {
            return NextResponse.json({ error: `Specified Ward branch [${targetWard}] not found inside ${lgaMatch.name} LGA` }, { status: 404 });
        }

        // Map and extract the leaf polling unit entries embedded inside the target structural ward
        const pollingUnitsList = (wardMatch.pollingUnits || []).map(pu => ({
            id: pu.id,
            name: pu.name,
            code: pu.delimitation || pu.units || pu.abbreviation,
            delimitation: pu.delimitation,
            remark: pu.remark,
            abbreviation: pu.abbreviation
        }));

        return NextResponse.json({
            lga: lgaMatch.name,
            ward: wardMatch.name,
            pollingUnits: pollingUnitsList
        });
    }

    // Dynamic resolution of parent containers for this LGA
    let resolvedSenatorialDistrict = "Unknown District";
    let resolvedFedConstituency = "Unknown Constituency";
    let resolvedStateConstituency = "Mapping Pending";

    // 3a. Geopolitical lookup for Senatorial District
    if (stateSenatorialBoundaries.length > 0) {
        const match = stateSenatorialBoundaries.find(district =>
            district.lgas && district.lgas.some(lgaName => normalizeString(lgaName) === normalizeString(lgaMatch.name))
        );
        if (match) resolvedSenatorialDistrict = match.name;
    }

    // 3b. Geopolitical lookup for House of Reps
    if (stateGreenChamberBoundaries.length > 0) {
        const match = stateGreenChamberBoundaries.find(constituency =>
            constituency.lgas && constituency.lgas.some(lgaName => normalizeString(lgaName) === normalizeString(lgaMatch.name))
        );
        if (match) resolvedFedConstituency = match.name;
    }

    // 3c. Geopolitical lookup for State House of Assembly
    if (stateHouseBoundaries.length > 0) {
        const match = stateHouseBoundaries.find(item => normalizeString(item.lga) === normalizeString(lgaMatch.name));
        if (match) {
            resolvedStateConstituency = match.name; // points to item.district mapping layout
            if (resolvedSenatorialDistrict === "Unknown District" && match.sen_district) {
                resolvedSenatorialDistrict = match.sen_district;
            }
        }
    }

    // If explicit query parameters were supplied, enforce them over structural database derivation guesses
    if (targetStateConstituency) resolvedStateConstituency = targetStateConstituency;
    if (targetSenatorialDistrict) resolvedSenatorialDistrict = targetSenatorialDistrict;
    if (targetFedConstituency) resolvedFedConstituency = targetFedConstituency;

    // Extract wards list safely and add item counts if helpful for sub-tree sizing
    const wardsList = (lgaMatch.wards || []).map(ward => ({
        id: ward.id,
        name: ward.name,
        abbreviation: ward.abbreviation,
        puCount: ward.pollingUnits ? ward.pollingUnits.length : 0
    }));

    return NextResponse.json({
        lga: lgaMatch.name,
        state: targetState.toUpperCase(),
        senatorial_district: resolvedSenatorialDistrict,
        fed_constituency: resolvedFedConstituency,
        state_constituency: resolvedStateConstituency,
        wards: wardsList
    });
}
