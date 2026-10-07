# Agent reconstruction recipe — M3D self-powered IC v2

Build from an empty SOI model. Save every named snapshot. Do not change WaferCAD source during the reconstruction.

1. `00_SOI`: 70 nm B-doped monocrystalline Si on 2 µm BOX.
2. `01_PVM_Si`: `PVM_M01_Si_channel_etch.svg`; directional Si etch. Black is remove area.
3. `02_PVM_Cr`: `PVM_M02_Cr_contact.svg`; 20 nm Cr + 50 nm Au.
4. `03_PVM_Pt`: `PVM_M03_Pt_contact.svg`; 80 nm Pt.
5. `04_Power_Rails`: `M3D_M04_power_rail.svg`; 70 nm Pt.
6. `05_ILD1`: blanket 100 nm Al₂O₃, Conformal.
7. `06_Power_Via_Open`: `M3D_M05_power_via_open_ILD1.svg`; selective ILD1 etch only.
8. `07_Power_Via_Fill`: 120 nm Ti.
9. `08_Back_Gates`: `M3D_M06_local_back_gate.svg`; 2 nm Ti / 18 nm Pt.
10. `09_HfO2`: blanket 10 nm HfO₂, Conformal.
11. `10_HfO2_Open`: `M3D_M07_HfO2_open.svg`; selective HfO₂ opening.
12. `11_WSe2_Transfer`: bilayer WSe₂, **Transfer / Laminate → Follow surface**, zero gap.
13. `12_WSe2_Pattern`: retain `M3D_M08_WSe2_channel.svg`; 0.2 × 0.5 µm channels.
14. `13_WSe2_SD`: `M3D_M09_WSe2_SD.svg`; 10 nm Pd / 30 nm Pt.
15. `14_WSe2_Anneal`: Record only, NO, 100 °C, 30 min.
16. `15_WSe2_Cap`: `M3D_M10_WSe2_cap.svg`; local 20 nm Al₂O₃.
17. `16_MoS2_Transfer`: monolayer MoS₂, **Transfer / Laminate → Follow surface**, zero gap.
18. `17_MoS2_Pattern`: retain `M3D_M11_MoS2_channel.svg`; 0.2 × 0.5 µm channels.
19. `18_MoS2_SD_Bridge`: `M3D_M12_MoS2_SD_bridge.svg`; 30 nm Ni / 10 nm Au.
20. `19_ILD2`: blanket 50 nm Al₂O₃, Conformal.
21. `20_Data_Power_Via_Open`: `M3D_M13_ILD2_data_power_via_open.svg`; selective ILD2 etch only.
22. `21_Via2_Fill`: 2 nm Ti / 28 nm Ni / 30 nm Au.
23. `22_Graphene_Transfer`: monolayer graphene, **Transfer / Laminate → Follow surface**, zero gap.
24. `23_Graphene_Pattern`: retain `M3D_M14_graphene_channel.svg`.
25. `24_Graphene_SD`: `M3D_M15_graphene_SD_via_connect.svg`; 2 nm Ti / 28 nm Ni / 30 nm Au.
26. `25_Final_Al2O3`: blanket 70 nm Al₂O₃, Conformal.
27. `26_Final_Sensing_Windows`: `M3D_M16_final_cap_open_sensing_windows.svg`; selectively open final Al₂O₃ only.

After every geometry step inspect Main, Section and 3D. Stop and record a bug if Transfer leaves a supported-surface air gap, Follow-surface Transfer creates film inside a true void, Conformal throws a polygon/output-ring error, a via crosses its dielectric stop, closed solids receive internal conformal material, or Section/3D disagree on Z order.
