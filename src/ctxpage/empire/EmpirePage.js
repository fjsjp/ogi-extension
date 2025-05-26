import { getLogger } from "../../util/logger.js";

class EmpirePage {
  logger;

  constructor() {
    this.logger = getLogger("EmpirePage");
  }

  #GetWorkinProgressGroupsAndPatterns(groups) {
    //create a list of patterns to match the groups ('?' is a wildcard for lifeform groups)
    const toParseGroups = [
      "supply",
      "station",
      "defence",
      "research",
      "ships",
      "lifeform?buildings",
      "lifeform?research",
    ];

    const patterns = toParseGroups.map((pattern) => ({
      pattern,
      name: pattern.replace("?", ""),
      regex: new RegExp("^" + pattern.replace("?", ".*") + "$"),
    }));

    const result = [];
    for (const key of Object.keys(groups)) {
      const match = patterns.find(({ regex }) => regex.test(key));
      if (match) {
        result.push({ property: key, name: match.name, techIds: groups[key] });
      }
    }
    return result;
  }

  #GetWorkInProgressTechs(planetOrMoon, groups) {
    const workInProgressTechs = new Array();

    groups.forEach((group) => {
      group.techIds.forEach((techId) => {
        const htmlKey = `${techId}_html`;

        if (planetOrMoon[htmlKey]) {
          const htmlString = planetOrMoon[htmlKey];
          if (htmlString) {
            // Create a temporary element to parse the HTML string
            const temp = document.createElement("div");
            temp.innerHTML = htmlString.trim();

            /*
             * if there is only one child, we can ignore it, because it is just a text node.
             * but if there is more than one child, there is a downgrade or an upgrade
             */
            if (temp.children.length > 1) {
              const activeElement = temp.querySelector(".active");
              const activeValue = activeElement ? parseInt(activeElement.textContent.trim(), 10) : null;

              if (!isNaN(activeValue)) {
                workInProgressTechs.push({
                  group: group.name,
                  id: techId,
                  from: planetOrMoon[techId],
                  to:
                    group.name === "defence" || group.name === "ships"
                      ? planetOrMoon[techId] + activeValue
                      : activeValue, // for defence and ships, the value is the current level + the upgrade level
                });
              }
            }
          }
        }
      });
    });

    return workInProgressTechs;
  }

  async #GetEmpireObjectAsync(moon) {
    const params = { page: "standalone", component: "empire" };
    if (moon) {
      params.planetType = "1"; // 1 for moons
    }

    const abortController = new AbortController();
    window.onbeforeunload = () => abortController.abort();
    const empireRequest = (href) =>
      fetch(`?${href.toString()}`, { signal: abortController.signal })
        .then((response) => response.text())
        .then((string) =>
          JSON.parse(
            string.substring(string.indexOf("createImperiumHtml") + 47, string.indexOf("initEmpire") - 16),
            (_, value) => {
              if (value === "0") return 0;
              return value;
            }
          )
        );

    return await empireRequest(new URLSearchParams(params));
  }

  async GetEmpireAsync() {
    this.logger.debug("Fetching empire data...", new Date().toISOString());
    var empireObjectPlanets = await this.#GetEmpireObjectAsync(false);
    var empireObjectMoons = await this.#GetEmpireObjectAsync(true);
    this.logger.debug("Empire data fetched successfully.", new Date().toISOString());

    let translations = empireObjectPlanets.translations.planets;
    if (empireObjectMoons.translations.planets) {
      translations = Object.assign({}, translations, empireObjectMoons.translations.planets);
    }
    const empire = {
      translations: translations,
      planets: empireObjectPlanets.planets,
      moons: empireObjectMoons.planets,
    };

    // Set the work in progress techs for planets and moons
    const setWorkInProgressTechs = (planetsOrMoons, groups) => {
      planetsOrMoons.forEach((planetOrMoon) => {
        planetOrMoon.workInProgressTechs = this.#GetWorkInProgressTechs(
          planetOrMoon,
          this.#GetWorkinProgressGroupsAndPatterns(groups)
        );

        // Remove HTML keys that was only used for the work in progress techs
        // We don't need the HTML keys anymore, so we can delete them
        for (const key in planetOrMoon) {
          if (key.includes("html") && key !== "equipment_html") {
            delete planetOrMoon[key];
          }
        }
      });
    };
    setWorkInProgressTechs(empire.planets, empireObjectPlanets.groups);
    setWorkInProgressTechs(empire.moons, empireObjectMoons.groups);

    // Set the planet and moon relationships
    empire.planets.forEach((planet) => {
      planet.invalidate = false;
      if (empire.moons) {
        empire.moons.forEach((moon) => {
          if (planet.moonID === moon.id) {
            planet.moon = moon;
            planet.moon.invalidate = false;
          }
        });
      }
    });

    //just for debugging purposes, about performance
    this.logger.debug("Empire data parsed successfully.", new Date().toISOString());
    return empire;
  }
}

export default new EmpirePage();
