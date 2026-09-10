using Vanilla.Map;

var cases = new (string?, string?, int?, int?, FloorTheme)[] {
    (null, null, null, null, FloorTheme.Unknown),
    ("Dimension_Jungle_E2", null, null, null, FloorTheme.Jungle),
    ("DIMENSION_DESERT_R8_01", null, 0, 0, FloorTheme.Desert),
    (null, null, 0, 0, FloorTheme.DigSite),
    (null, null, 0, 1, FloorTheme.Refinery),
    (null, null, 0, 2, FloorTheme.Storage),
    (null, null, 2, 3, FloorTheme.Tech),
    (null, null, 2, 4, FloorTheme.TechLab),
    (null, null, 1, 6, FloorTheme.Service),
    (null, null, 0, 7, FloorTheme.Mining),
    (null, null, 0, 5, FloorTheme.Unknown),
    (null, null, 1, 5, FloorTheme.Unknown),
    (null, null, 2, 8, FloorTheme.Unknown),
    (null, null, 2, 9, FloorTheme.Tech),
    (null, null, 2, 10, FloorTheme.Tech),
    (null, null, 0, 12, FloorTheme.Mining),
    (null, null, 2, 6, FloorTheme.Unknown),
    (null, "geo_gardens_forest", 1, 11, FloorTheme.Gardens),
    (null, "geo_gardens_lab", 1, 11, FloorTheme.Gardens),
    (null, "geo_gardens_unknown", 1, 11, FloorTheme.Gardens),
    (null, "geo_64x64_tech_lab_JH_01", 2, 5, FloorTheme.TechLab),
    (null, "geo_64x64_tech_data_center_HA_01", 2, 8, FloorTheme.Tech),
    (null, "geo_64x64_service_gardens_JG_01", 1, 11, FloorTheme.Gardens),
    ("Assets/Complex/Mining/geo_64x64_mining_refinery_X_VS_01_v2.prefab", null, 0, 0, FloorTheme.Refinery),
    ("Assets/Complex/Dimensions/PouncerArena/PouncerArena_01.prefab", null, 0, 0, FloorTheme.Unknown),
    ("Assets/Complex/Dimensions/Desert/Dimension_Jungle_E2.prefab", null, 0, 0, FloorTheme.Jungle),
    (null, null, 2, null, FloorTheme.Unknown),
    (null, null, 2, 999, FloorTheme.Unknown),
};
foreach (var (dimension, geomorph, complex, sub, expected) in cases) {
    var actual = FloorThemeCodec.FromSource(dimension, geomorph, complex, sub);
    if (actual != expected) throw new Exception($"Theme mismatch: {dimension}/{geomorph}/{complex}/{sub}: {actual} != {expected}");
}
if ((byte)FloorTheme.Unknown != 0 || (byte)FloorTheme.Jungle != 10 || (byte)FloorTheme.TechLab != 11 || (byte)FloorTheme.Gardens != 12) throw new Exception("Persisted theme values changed.");
Console.WriteLine($"PASS: {cases.Length} floor source mappings, including unresolved and future values.");
ResourceContainerTests.Run();
