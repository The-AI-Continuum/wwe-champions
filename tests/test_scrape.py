import unittest

from scrape import parse_last_defense_from_matches


class ParseLastDefenseFromMatchesTests(unittest.TestCase):
    def test_returns_the_date_when_current_reign_has_one_defense(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>11.09.2026</td><td></td><td>WWE Women's Title: Chelsea Green (c) defeats Nia Jax</td></tr>
        </table>
        """

        self.assertEqual(parse_last_defense_from_matches(html), "September 11, 2026")

    def test_does_not_count_the_current_reign_title_change_as_a_defense(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>10.10.2026</td><td></td><td>Women's World Title: Liv Morgan defeats Becky Lynch (c) - TITLE CHANGE !!!</td></tr>
        </table>
        """

        self.assertIsNone(parse_last_defense_from_matches(html))

    def test_uses_the_latest_defense_and_skips_the_reign_start(self):
        html = """
        <table>
          <tr><th>No.</th><th>Date</th><th>Match</th></tr>
          <tr><td>1</td><td>18.09.2026</td><td></td><td>Undisputed WWE Title: Sami Zayn (c) defeats Kevin Owens</td></tr>
          <tr><td>2</td><td>11.09.2026</td><td></td><td>Undisputed WWE Title: Sami Zayn defeats CM Punk (c) - TITLE CHANGE !!!</td></tr>
        </table>
        """

        self.assertEqual(parse_last_defense_from_matches(html), "September 18, 2026")

if __name__ == "__main__":
    unittest.main()
