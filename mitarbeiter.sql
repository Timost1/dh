-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Erstellungszeit: 12. Okt 2026 um 15:39
-- Server-Version: 10.11.14-MariaDB-0ubuntu0.24.04.1
-- PHP-Version: 8.3.6

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `db_emhs`
--

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `mitarbeiter`
--

CREATE TABLE `mitarbeiter` (
  `id` int(11) NOT NULL,
  `name` text DEFAULT NULL,
  `rfid` text DEFAULT NULL,
  `schicht` text DEFAULT NULL,
  `isAdmin` int(11) DEFAULT 0,
  `kannFahrtenLoeschen` int(11) DEFAULT 0,
  `kannFahrtenBearbeiten` int(11) DEFAULT 0,
  `kannWochenplanBearbeiten` int(11) DEFAULT 0,
  `kannProjektplanerBearbeiten` int(11) DEFAULT 0,
  `Meister` int(11) DEFAULT 0,
  `Vertreter` int(11) DEFAULT 0,
  `adminUserId` int(11) DEFAULT 0,
  `kannSAWSehen` int(11) DEFAULT 1,
  `kannSAWBearbeiten` int(11) DEFAULT 0,
  `kannSAWBearbeitenPlus` int(11) DEFAULT 0,
  `Lagermensch` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Daten für Tabelle `mitarbeiter`
--

INSERT INTO `mitarbeiter` (`id`, `name`, `rfid`, `schicht`, `isAdmin`, `kannFahrtenLoeschen`, `kannFahrtenBearbeiten`, `kannWochenplanBearbeiten`, `kannProjektplanerBearbeiten`, `Meister`, `Vertreter`, `adminUserId`, `kannSAWSehen`, `kannSAWBearbeiten`, `kannSAWBearbeitenPlus`, `Lagermensch`) VALUES
(1, 'Pascal Becker', '775B8891', 'B', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(2, 'Timo Steffensky', '77139B91', 'A', 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0),
(3, 'Marc Beitz', '8396180E', 'A', 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0),
(4, 'Pascal Becker', '40BB7EFA', 'B', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(5, 'Stefan Schäfer', '40C1ADFA', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(6, 'Stefan Schäfer', '838D580E', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(8, 'Jakob Woll', '8358A324', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(9, 'Jakob Woll', '401395FA', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(10, 'Rainer Spurk', '408474FA', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(11, 'Volker Spurk', '404689FA', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(12, 'Volker Spurk', '41DA6216', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(13, 'Jonas Scherer', '77258191', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(14, 'Jonas Scherer', '793E08B4', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(16, 'Maximilian Sturm', '83683E0E', 'Buero', 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0),
(17, 'Rainer Spurk', '412C6716', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(18, 'Albion Dragusha', '79CBFBB3', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(19, 'Florian Welsch', '40DEADFA', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(20, 'Yasar Tokay', '40E479FA', 'C', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(21, 'Hakan Uzun', '404BABFA', 'C', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(23, 'Merlin Böhm', '4024B9FA', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(24, 'Tim Hippchen', '40B9A1FA', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(901, 'Lauren Ukaj', '79B1FBB3', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(902, 'Michael Hauser', '792B4DB4', 'E', 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 0, 0),
(903, 'Michael Hauser', '83438F05', 'E', 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 0, 0),
(904, 'Jochem Hermann', '40D3B9FA', 'E', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(905, 'Ahmad Altaei', '3EBF18E6', 'E', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(906, 'Etienne Pistorius', '40C3BAFA', 'E', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(907, 'Timo Endres', '40D8C6FA', 'E', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(909, 'Marcel Dörr', '41803016', 'Buero', 0, 0, 0, 1, 1, 0, 0, 16, 1, 1, 1, 0),
(913, 'Zimmer Alex', '41A91F16', 'Buero', 0, 0, 0, 1, 1, 0, 0, 16, 1, 1, 1, 0),
(917, 'Richard Daniel', '40B2BEFA', 'F', 0, 0, 0, 0, 0, 0, 0, 16, 1, 0, 0, 0),
(918, 'Christian Selzer', '41FC6D16', 'C', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(919, 'Christian Selzer', '4018D5FA', 'C', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(921, 'Philipp Raß', '839B430E', 'Buero', 1, 0, 1, 1, 1, 0, 0, 16, 1, 1, 1, 0),
(922, 'Dirk Brandau', '3EE516E6', 'Buero', 1, 0, 0, 1, 1, 0, 0, 908, 1, 1, 1, 0),
(923, 'Thomas Guillaume', '4083D5FA', 'B', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(924, 'Thomas Guilaume', '41912516', 'B', 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0),
(925, 'Annika Jakobs', '40DDCFFA', 'F', 0, 0, 0, 1, 0, 0, 0, 3, 1, 1, 1, 0),
(926, 'Marvin Schumacher', '40B690FA', 'C', 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0),
(927, 'Marvin Schumacher', '83BB9224', 'C', 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0),
(929, 'Achim Reichert', '40D4B9FA', 'D', 0, 0, 0, 0, 0, 0, 0, 928, 1, 0, 0, 0),
(930, 'Maurice Tecquert', '40827DFA', 'C', 0, 0, 0, 0, 0, 0, 0, 928, 1, 0, 0, 0),
(932, 'Maximilian Sturm', '797CC798', 'Buero', 1, 1, 1, 1, 1, 0, 0, 2, 1, 0, 0, 0),
(933, 'Marcel Dörr', '40C2ACFA', 'Buero', 0, 0, 0, 1, 1, 0, 0, 2, 1, 1, 1, 0),
(934, 'Zimmer Alex', '40C1A1FA', 'Buero', 0, 0, 0, 1, 1, 0, 0, 2, 1, 1, 1, 0),
(936, 'Philipp Raß', '4098D8FA', 'Buero', 1, 0, 1, 1, 1, 0, 0, 2, 1, 1, 1, 0),
(937, 'Timo Steffensky', '40E1ABFA', 'F', 0, 1, 1, 1, 1, 0, 0, 2, 1, 1, 1, 1),
(938, 'Marc Beitz', '402176FA', 'A', 1, 1, 1, 1, 1, 0, 0, 937, 1, 0, 0, 0),
(940, 'Julian Seger', '40F588FA', 'D', 0, 0, 0, 0, 0, 0, 0, 938, 1, 0, 0, 0),
(941, 'Rami Alasmi', '408789FA', 'B', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(942, 'Rami Alasmi', '77B18091', 'B', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(943, 'Andreas Meyer', '40EAC5FA', 'C', 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0),
(944, 'Andreas Meyer', '41082716', 'C', 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0),
(945, 'Lauren Ukaj', '77C4D691', 'F', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(946, 'Axel Müllenbach', '4007C0FA', 'Buero', 0, 0, 0, 1, 0, 0, 0, 2, 1, 1, 0, 0),
(947, 'Michael Schütz', '793821B4', 'Buero', 0, 0, 0, 1, 1, 0, 0, 932, 1, 1, 1, 0),
(948, 'Michael Schütz', '41E45216', 'Buero', 0, 0, 0, 1, 1, 0, 0, 932, 1, 1, 1, 0),
(949, 'Matthias Lauer', '40D2C8FA', 'B', 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0),
(950, 'Dietmar Winter', '40D5CFFA', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(951, 'Dietmar Winter', '41863216', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(952, 'Christopher Göhl', '40E189FA', 'B', 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0),
(953, 'Christopher Göhl', '41F22716', 'B', 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0),
(954, 'Florian Welsch', '4083ACFA', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(955, 'Florian Welsch', '7747A3D1', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(956, 'Rigobert Schug', '41035316', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(957, 'Rigobert Schug', '4095D0FA', 'F', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(958, 'Hermann Jochem', '41A23116', 'E', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(959, 'Matthias Lauer', '41434316', 'B', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(960, 'Dietmar Winter', '40BAD0FA', 'D', 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
(962, 'Annika Jakobs', '830B5D0E', 'F', 0, 0, 0, 1, 0, 0, 0, 3, 1, 1, 1, 0),
(963, 'Jannik Weingardt', '81EC8584', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0),
(964, 'Jannik Weingardt', '83550E0E', 'A', 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `mitarbeiter`
--
ALTER TABLE `mitarbeiter`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT für exportierte Tabellen
--

--
-- AUTO_INCREMENT für Tabelle `mitarbeiter`
--
ALTER TABLE `mitarbeiter`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=965;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
