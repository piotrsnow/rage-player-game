export default {
  id: 'polish',
  label: 'Polish',

  promptBlock: '',

  nameBanks: {
    hamlet: [
      'Dębowy Zakątek', 'Borowa Osada', 'Kłosowe Pole', 'Wilcza Polana', 'Sosnowa Chata',
      'Mglisty Młyn', 'Kamienny Bród', 'Leśny Chutor', 'Jesionowa Kępa', 'Rzeczna Wólka',
      'Torfowa Osada', 'Bobrowe Rozlewisko', 'Szumna Dolinka', 'Jodłowy Przysiółek', 'Wrzosowa Łąka',
      'Głogowa Chata', 'Bagienny Rzut', 'Koźla Zagroda', 'Sowie Wzgórze', 'Zimny Strumień',
      'Liściasty Chłodnik', 'Miodowa Osada', 'Krzemowy Gródek', 'Lipowe Ustronie', 'Czarny Młyn',
      'Jagodny Wąwóz', 'Smolna Kępa', 'Grabowa Polana', 'Ciemna Chutor', 'Mchowa Osada',
    ],
    village: [
      'Lisowice', 'Modrzejów', 'Kamienna Wola', 'Strzegów', 'Jodłowy Brzeg',
      'Konopna', 'Biskupice', 'Radoszyn', 'Mierzęcin', 'Kępno Małe',
      'Wiślica', 'Czarnolas', 'Żabieniec', 'Jelenia Wola', 'Dobrowola',
      'Borzęcin', 'Krzywa Góra', 'Sieradowice', 'Zagórze', 'Brzegowa',
      'Przerośl', 'Kwiatków', 'Orzechowa', 'Sosnówka', 'Lipnica Dolna',
      'Rybno', 'Turowice', 'Wilczyce', 'Białogóra', 'Studzianki',
    ],
    town: [
      'Kamienica', 'Miodogród', 'Złoty Potok', 'Wrońsk', 'Srebrnogród',
      'Twarda Grobla', 'Grabowiec', 'Dębogóra', 'Kruszwica', 'Brzostówka',
      'Ostrołęka', 'Sandomir', 'Przemyśl Stary', 'Świętopółk', 'Wolbrom',
      'Dobrogrodek', 'Piekary', 'Sławków', 'Wieliszew', 'Bielany',
      'Zatorów', 'Pyrzyce Górne', 'Kolbierz', 'Czorsztyn', 'Rawa Niska',
      'Książ Dolny', 'Radomil', 'Tarnowiec', 'Morągów', 'Olkuszyn',
    ],
    city: [
      'Radogoszcz', 'Białobrzeg', 'Srebrna Przystań', 'Gniezdno', 'Wawelgród',
      'Złotoryja', 'Piastowice', 'Krzyżogród', 'Miedziana Wieża', 'Jarosławek',
      'Wielkopole', 'Starogard', 'Lubusz', 'Piotrogród', 'Kamienna Wieża',
      'Orlogród', 'Święcicz', 'Chrobrogród', 'Bielogród', 'Czerwień',
    ],
  },

  sublocationExamples: {
    good: '"Wieża Maga", "Chata Starej Wiedźmy", "Karczma Pod Skowronkiem"',
    bad: '"dom", "chata", "sklep"',
  },

  npcNameExamples: {
    good: 'Marta, Borek, Zygmunt, Jadwiga, Wojsław, Halina, Bogdan, Wiesława',
    bad: 'John, Alice, Robert, Emily',
  },
};
