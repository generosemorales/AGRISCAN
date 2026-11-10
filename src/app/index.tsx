import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BACKEND_URL = resolveBackendUrl();

function resolveBackendUrl(): string | null {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/+$/, "")}/api/diagnose`;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  const developmentHost = new URL(`http://${hostUri}`).hostname;
  return `http://${developmentHost}:5000/api/diagnose`;
}

type DiseaseCategory = "Fungal" | "Bacterial" | "Viral";
type Disease = {
  name: string;
  category: DiseaseCategory;
  crops: string;
  description: string;
  symptoms: string;
  causes: string;
  prevention: string;
  treatment: string;
  image: string;
};

type DiagnosisResult = {
  plantName?: string;
  healthStatus?: string;
  severity?: string;
  confidence?: number;
  description?: string;
  symptoms?: string[];
  causes?: string;
  treatments?: string[];
  preventionTips?: string[];
};

const diseases: Disease[] = [
  {
    name: "Early blight",
    category: "Fungal",
    crops: "Tomato · Potato",
    description: "Dark, target-like spots that usually begin on older leaves.",
    symptoms:
      "Brown spots with concentric rings, yellowing around lesions, and lower leaves that dry and fall.",
    causes:
      "The fungus Alternaria solani survives in crop debris and spreads in wind, rain, and splashing water.",
    prevention:
      "Rotate crops, remove infected debris, water at soil level, and give plants room for airflow.",
    treatment:
      "Remove affected leaves and dispose of them away from the garden. For severe cases, use a locally approved fungicide according to its label.",
    image:
      "https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=960&q=80",
  },
  {
    name: "Powdery mildew",
    category: "Fungal",
    crops: "Cucurbits · Grapes · Many crops",
    description: "A white, powdery coating that spreads across leaf surfaces.",
    symptoms:
      "White or gray powder-like patches on leaves and stems; leaves may curl, yellow, and dry.",
    causes:
      "Several fungi cause powdery mildew. Spores spread by air and thrive in crowded plantings with humid nights.",
    prevention:
      "Choose resistant varieties, improve spacing and airflow, and avoid excess nitrogen.",
    treatment:
      "Remove badly affected leaves. If needed, use a suitable labeled treatment early and repeat only as directed.",
    image:
      "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=960&q=80",
  },
  {
    name: "Bacterial leaf spot",
    category: "Bacterial",
    crops: "Pepper · Tomato · Brassicas",
    description: "Small water-soaked marks can darken and merge in warm, wet weather.",
    symptoms:
      "Tiny dark or water-soaked spots, sometimes with yellow halos; fruit may develop raised scabs.",
    causes:
      "Bacteria spread through infected seed or transplants and move between plants in splashing water and on tools.",
    prevention:
      "Use clean seed and transplants, avoid handling wet plants, sanitize tools, and rotate susceptible crops.",
    treatment:
      "Remove infected plant material and keep foliage dry. Copper products may help limit spread when labeled for the crop, but cannot cure infected tissue.",
    image:
      "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=960&q=80",
  },
  {
    name: "Leaf curl virus",
    category: "Viral",
    crops: "Tomato · Chili · Beans",
    description: "New growth may curl, become pale, and stay smaller than normal.",
    symptoms:
      "Upward-curling leaves, yellow margins, shortened shoots, and stunted growth; fruit set may be reduced.",
    causes:
      "A group of plant viruses spread by sap-feeding insects such as whiteflies.",
    prevention:
      "Use healthy transplants, remove weeds and infected plants, and monitor for whiteflies with locally recommended controls.",
    treatment:
      "There is no cure for a virus-infected plant. Remove affected plants promptly and manage insect vectors to protect healthy crops.",
    image:
      "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=960&q=80",
  },
];

const filters = ["All", "Fungal", "Bacterial", "Viral"] as const;
type Filter = (typeof filters)[number];

export default function App() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [scannerPulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scannerPulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scannerPulse, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [scannerPulse]);

  const filteredDiseases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return diseases.filter((disease) => {
      const matchesCategory = filter === "All" || disease.category === filter;
      const matchesQuery =
        !normalizedQuery ||
        `${disease.name} ${disease.crops} ${disease.description}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [filter, query]);

  const pickImage = async (useCamera = false) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          `Please allow ${useCamera ? "camera" : "photo library"} access to scan a leaf.`,
        );
        return;
      }

      const pickerResult = useCamera
        ? await ImagePicker.launchCameraAsync({
            quality: 0.2,
            base64: true,
            allowsEditing: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.2,
            base64: true,
            allowsEditing: true,
          });

      const asset = pickerResult.assets?.[0];
      if (pickerResult.canceled || !asset?.uri) return;

      setImageUri(asset.uri);
      setBase64(asset.base64 ?? null);
      setImageMimeType(asset.mimeType ?? "image/jpeg");
      setResult(null);
    } catch (error) {
      Alert.alert(
        "Could not open image picker",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const analyzeLeaf = async () => {
    if (!base64) {
      Alert.alert("Image unavailable", "Please choose or take another photo.");
      return;
    }
    if (!BACKEND_URL) {
      Alert.alert(
        "Diagnosis server not configured",
        "Set EXPO_PUBLIC_API_URL to the backend computer's address, for example http://192.168.1.20:5000, then reload the app.",
      );
      return;
    }
    setLoading(true);

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, imageMimeType }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          errorData?.error ??
            `The diagnosis service returned error ${response.status}.`,
        );
      }

      const data = (await response.json()) as DiagnosisResult;
      setResult(data);
    } catch (error) {
      Alert.alert(
        "Could not analyze leaf",
        error instanceof TypeError
          ? `Could not connect to the diagnosis server at ${BACKEND_URL}.\n\nMake sure server.js is running, your phone and computer are on the same Wi-Fi, and the computer allows connections on port 5000. For a different server address, set EXPO_PUBLIC_API_URL in .env.local and reload the app.`
          : error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const openScanner = () => {
    setScannerVisible(true);
    setSelectedDisease(null);
  };

  const closeScanner = () => {
    setScannerVisible(false);
  };

  const healthStatus = result?.healthStatus?.toLowerCase().trim() ?? "";
  const isHealthy =
    (healthStatus.includes("healthy") && !healthStatus.includes("unhealthy")) ||
    healthStatus.includes("no disease");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Ionicons name="leaf" size={20} color={COLORS.white} />
            </View>
            <View>
              <Text style={styles.brandName}>AgriScan</Text>
              <Text style={styles.brandSubtitle}>PLANT HEALTH GUIDE</Text>
            </View>
          </View>
          <View style={styles.headerBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerBadgeText}>FIELD GUIDE</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>GROW WITH CONFIDENCE</Text>
          <Text style={styles.title}>A healthier harvest starts here.</Text>
          <Text style={styles.introCopy}>
            Spot common plant diseases early and learn how to protect your crops.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color={COLORS.muted} />
          <TextInput
            accessibilityLabel="Search plant diseases"
            placeholder="Search diseases or crops"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
            >
              <Ionicons name="close-circle" size={19} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
          >
            {filters.map((item) => {
              const active = filter === item;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Common conditions</Text>
            <Text style={styles.sectionCaption}>
              Practical guides for healthier plants
            </Text>
          </View>
          <Text style={styles.countText}>{filteredDiseases.length} guides</Text>
        </View>

        {filteredDiseases.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="leaf-outline" size={30} color={COLORS.green} />
            <Text style={styles.emptyTitle}>No guides found</Text>
            <Text style={styles.emptyCopy}>
              Try a different crop, disease, or category.
            </Text>
          </View>
        ) : (
          <View style={styles.diseaseList}>
            {filteredDiseases.map((disease) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={disease.name}
                onPress={() => setSelectedDisease(disease)}
                activeOpacity={0.88}
                style={styles.diseaseCard}
              >
                <Image source={{ uri: disease.image }} style={styles.cardImage} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTopline}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryText}>{disease.category}</Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={17}
                      color={COLORS.green}
                    />
                  </View>
                  <Text style={styles.cardTitle}>{disease.name}</Text>
                  <Text style={styles.cropText}>{disease.crops}</Text>
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {disease.description}
                  </Text>
                  <Text style={styles.readMore}>VIEW DISEASE GUIDE</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View pointerEvents="box-none" style={styles.floatingArea}>
        <View style={styles.scannerButtonWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scannerGlow,
              {
                opacity: scannerPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.18, 0.62],
                }),
                transform: [
                  {
                    scale: scannerPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1.18],
                    }),
                  },
                ],
              },
            ]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open leaf scanner"
            activeOpacity={0.88}
            onPress={openScanner}
            style={styles.scannerButton}
          >
            <Ionicons name="scan" size={30} color={COLORS.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.scannerLabel}>SCAN A LEAF</Text>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (selectedDisease) setSelectedDisease(null);
          else closeScanner();
        }}
        transparent
        visible={selectedDisease !== null || scannerVisible}
      >
        {selectedDisease ? (
          <SafeAreaView style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                accessibilityLabel="Close disease guide"
                onPress={() => setSelectedDisease(null)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={COLORS.ink} />
              </TouchableOpacity>
              <Text style={styles.modalEyebrow}>DISEASE GUIDE</Text>
              <View style={styles.closeButtonSpacer} />
            </View>
            <ScrollView
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: selectedDisease.image }}
                style={styles.detailImage}
              />
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{selectedDisease.category}</Text>
              </View>
              <Text style={styles.detailTitle}>{selectedDisease.name}</Text>
              <Text style={styles.detailCrops}>{selectedDisease.crops}</Text>
              <Text style={styles.detailIntro}>{selectedDisease.description}</Text>
              <InfoSection title="Symptoms & signs" body={selectedDisease.symptoms} />
              <InfoSection title="What causes it?" body={selectedDisease.causes} />
              <InfoSection
                title="Prevention"
                body={selectedDisease.prevention}
                icon="shield-checkmark-outline"
              />
              <InfoSection
                title="Recommended treatment"
                body={selectedDisease.treatment}
                icon="medkit-outline"
              />
              <Text style={styles.disclaimer}>
                Disease signs can look alike. Use this guide as a starting point
                and consult a local crop specialist for confirmation.
              </Text>
            </ScrollView>
          </SafeAreaView>
        ) : (
          <SafeAreaView style={styles.scannerModal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                accessibilityLabel="Close scanner"
                onPress={closeScanner}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={COLORS.ink} />
              </TouchableOpacity>
              <Text style={styles.modalEyebrow}>LEAF SCANNER</Text>
              <View style={styles.closeButtonSpacer} />
            </View>
            {result ? (
              <View style={styles.resultsLayout}>
                <View style={styles.resultsImageFrame}>
                  {imageUri && (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.resultsImage}
                      resizeMode="cover"
                    />
                  )}
                </View>
                <ScrollView
                  style={styles.resultsDetailsScroll}
                  contentContainerStyle={styles.resultsContent}
                  showsVerticalScrollIndicator={false}
                >
                  <DiagnosisReveal>
                    <View style={styles.resultsCard}>
                      <View style={styles.resultsCardContent}>
                        <View style={styles.resultHero}>
                          <View style={styles.resultHeroTop}>
                            <View
                              style={[
                                styles.resultIcon,
                                isHealthy ? styles.resultIconHealthy : styles.resultIconDiseased,
                              ]}
                            >
                              <Ionicons
                                name={isHealthy ? "checkmark" : "alert"}
                                size={22}
                                color={isHealthy ? COLORS.green : COLORS.amber}
                              />
                            </View>
                            {typeof result.confidence === "number" && (
                              <View style={styles.confidencePill}>
                                <Text style={styles.confidenceValue}>
                                  {Math.round(result.confidence)}%
                                </Text>
                                <Text style={styles.confidenceLabel}>CONFIDENCE</Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.resultHeroEyebrow,
                              !isHealthy && styles.resultHeroEyebrowDiseased,
                            ]}
                          >
                            {isHealthy ? "PLANT HEALTH" : "POSSIBLE CONDITION"}
                          </Text>
                          <Text style={styles.resultHeroTitle}>
                            {isHealthy
                              ? "Healthy leaf"
                              : result.healthStatus || "Disease detected"}
                          </Text>
                          <Text style={styles.resultHeroPlant}>
                            {result.plantName || "Plant identification unavailable"}
                          </Text>
                          {isHealthy ? (
                            <Text style={styles.resultHeroDescription}>
                              No disease signs were identified in this image.
                            </Text>
                          ) : result.description ? (
                            <Text style={styles.resultHeroDescription}>
                              {result.description}
                            </Text>
                          ) : null}
                        </View>

                        {!isHealthy && (
                          <>
                            {result.symptoms?.length ? (
                              <ResultSection
                                title="Symptoms & signs"
                                body={result.symptoms.join("\n\n")}
                              />
                            ) : null}
                            {result.causes ? (
                              <ResultSection title="Possible causes" body={result.causes} />
                            ) : null}
                            {result.treatments?.length ? (
                              <ResultSection
                                title="Recommended treatment"
                                body={result.treatments.join("\n\n")}
                              />
                            ) : null}
                            {result.preventionTips?.length ? (
                              <ResultSection
                                title="Prevention"
                                body={result.preventionTips.join("\n\n")}
                              />
                            ) : null}
                          </>
                        )}
                        <Text style={styles.disclaimer}>
                          AI results are a guide, not a confirmed diagnosis.
                        </Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => {
                            setResult(null);
                            setImageUri(null);
                            setBase64(null);
                          }}
                          style={styles.scanAgainButton}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="scan-outline" size={18} color={COLORS.white} />
                          <Text style={styles.scanAgainText}>Scan another leaf</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </DiagnosisReveal>
                </ScrollView>
              </View>
            ) : (
            <ScrollView
              contentContainerStyle={styles.scannerContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.scannerIntro}>
                <View style={styles.scanIconRing}>
                  <Ionicons name="leaf" size={31} color={COLORS.green} />
                </View>
                <Text style={styles.scannerTitle}>Check your plant</Text>
                <Text style={styles.scannerDescription}>
                  Take a clear photo of one affected leaf, or upload an image to
                  get an AI-powered health check.
                </Text>
              </View>

              <View style={styles.pickerRow}>
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  style={styles.pickerButton}
                  activeOpacity={0.85}
                >
                  <View style={styles.pickerIcon}>
                    <Ionicons name="camera-outline" size={22} color={COLORS.green} />
                  </View>
                  <Text style={styles.pickerTitle}>Take a photo</Text>
                  <Text style={styles.pickerCaption}>Use your camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  style={styles.pickerButton}
                  activeOpacity={0.85}
                >
                  <View style={styles.pickerIcon}>
                    <Ionicons name="image-outline" size={22} color={COLORS.green} />
                  </View>
                  <Text style={styles.pickerTitle}>Upload image</Text>
                  <Text style={styles.pickerCaption}>Choose from gallery</Text>
                </TouchableOpacity>
              </View>

              {imageUri ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewFrame}>
                    <Image source={{ uri: imageUri }} style={styles.previewImage} />
                    {loading && <LeafScanOverlay />}
                  </View>
                  <View style={styles.previewCaption}>
                    <Ionicons
                      name={loading ? "scan-outline" : "checkmark-circle"}
                      size={18}
                      color={COLORS.green}
                    />
                    <Text style={styles.previewCaptionText}>
                      {loading ? "Scanning leaf for visible signs..." : "Leaf image ready"}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadHint}>
                  <Ionicons name="scan-outline" size={23} color={COLORS.green} />
                  <Text style={styles.uploadHintText}>
                    For best results, use a well-lit photo with the leaf in focus.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                disabled={!imageUri || loading}
                onPress={analyzeLeaf}
                activeOpacity={0.88}
                style={[
                  styles.analyzeButton,
                  (!imageUri || loading) && styles.analyzeButtonDisabled,
                ]}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color={COLORS.white} />
                    <Text style={styles.analyzeButtonText}>Analyzing leaf...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="sparkles"
                      size={18}
                      color={COLORS.white}
                    />
                    <Text style={styles.analyzeButtonText}>Analyze leaf</Text>
                  </>
                )}
              </TouchableOpacity>

            </ScrollView>
            )}
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function InfoSection({
  title,
  body,
  icon = "leaf-outline",
}: {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.infoSection}>
      <View style={styles.infoHeading}>
        <Ionicons name={icon} size={18} color={COLORS.green} />
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      <Text style={styles.infoBody}>{body}</Text>
    </View>
  );
}

function ResultSection({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.scanResultSection}>
      <Text style={styles.scanResultSectionTitle}>{title}</Text>
      <Text style={styles.scanResultSectionBody}>{body}</Text>
    </View>
  );
}

function DiagnosisReveal({ children }: { children: React.ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function LeafScanOverlay() {
  const [scanPosition] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const scan = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPosition, {
          toValue: 195,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(scanPosition, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ]),
    );

    scan.start();
    return () => scan.stop();
  }, [scanPosition]);

  return (
    <View pointerEvents="none" style={styles.scanOverlay}>
      <Animated.View
        style={[
          styles.scanLine,
          { transform: [{ translateY: scanPosition }] },
        ]}
      />
      <View style={styles.scanBadge}>
        <ActivityIndicator size="small" color={COLORS.white} />
        <Text style={styles.scanBadgeText}>ANALYZING</Text>
      </View>
    </View>
  );
}

const COLORS = {
  canvas: "#F5F7F1",
  white: "#FFFFFF",
  ink: "#172A20",
  muted: "#78877C",
  green: "#21814F",
  deepGreen: "#155C37",
  paleGreen: "#E8F3E9",
  border: "#E2E9DF",
  amber: "#B56B18",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 160 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 31,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  brandSubtitle: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.15,
    marginTop: 2,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  headerBadgeText: {
    fontSize: 9,
    color: COLORS.deepGreen,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  intro: { marginBottom: 21 },
  eyebrow: {
    color: COLORS.green,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  title: {
    color: COLORS.ink,
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 37,
    letterSpacing: -0.8,
    maxWidth: 340,
  },
  introCopy: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 350,
  },
  searchBox: {
    height: 51,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 14, paddingVertical: 0 },
  filterRow: { marginTop: 15, marginBottom: 24 },
  filterContent: { gap: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipActive: { backgroundColor: COLORS.deepGreen, borderColor: COLORS.deepGreen },
  filterText: { color: COLORS.muted, fontWeight: "600", fontSize: 12 },
  filterTextActive: { color: COLORS.white },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  sectionTitle: { color: COLORS.ink, fontSize: 19, fontWeight: "800" },
  sectionCaption: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  countText: { color: COLORS.green, fontWeight: "700", fontSize: 11 },
  diseaseList: { gap: 14 },
  diseaseCard: {
    backgroundColor: COLORS.white,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImage: { width: "100%", height: 158, backgroundColor: "#DCE9DB" },
  cardBody: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 15 },
  cardTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.paleGreen,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: { color: COLORS.deepGreen, fontSize: 10, fontWeight: "700" },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  cropText: { color: COLORS.green, fontSize: 11, fontWeight: "600", marginTop: 3 },
  cardDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  readMore: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: { color: COLORS.ink, fontWeight: "800", fontSize: 16, marginTop: 10 },
  emptyCopy: { color: COLORS.muted, fontSize: 12, marginTop: 5 },
  floatingArea: {
    position: "absolute",
    bottom: 13,
    alignSelf: "center",
    alignItems: "center",
    zIndex: 2,
  },
  scannerButtonWrap: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  scannerGlow: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#7CCB91",
  },
  scannerButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: COLORS.green,
    borderWidth: 5,
    borderColor: COLORS.canvas,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#123D25",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 9,
    elevation: 9,
  },
  scannerLabel: {
    color: COLORS.white,
    backgroundColor: COLORS.deepGreen,
    overflow: "hidden",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: -4,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  detailModal: { flex: 1, backgroundColor: COLORS.canvas },
  scannerModal: { flex: 1, backgroundColor: COLORS.canvas },
  modalHeader: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonSpacer: { width: 36 },
  modalEyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  detailContent: { paddingHorizontal: 20, paddingTop: 17, paddingBottom: 36 },
  detailImage: {
    width: "100%",
    height: 210,
    borderRadius: 18,
    backgroundColor: "#DCE9DB",
    marginBottom: 16,
  },
  detailTitle: { color: COLORS.ink, fontWeight: "800", fontSize: 27, marginTop: 9 },
  detailCrops: { color: COLORS.green, fontSize: 13, fontWeight: "700", marginTop: 4 },
  detailIntro: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 5 },
  infoSection: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 11,
  },
  infoHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoTitle: { color: COLORS.ink, fontWeight: "800", fontSize: 13   },
  infoBody: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  scannerContent: { paddingHorizontal: 20, paddingBottom: 32 },
  resultsLayout: { flex: 1 },
  resultsImageFrame: {
    height: "34%",
    minHeight: 145,
    maxHeight: 240,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#DCE9DB",
  },
  resultsDetailsScroll: { flex: 1, minHeight: 0 },
  resultsContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  resultsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  resultsImage: { width: "100%", height: "100%", backgroundColor: "#DCE9DB" },
  resultsCardContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  resultHero: { paddingBottom: 2 },
  resultHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  resultIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  resultIconHealthy: { backgroundColor: "#D5ECD9" },
  resultIconDiseased: { backgroundColor: "#FBE6C5" },
  confidencePill: {
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  confidenceValue: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  confidenceLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginTop: 1,
  },
  resultHeroEyebrow: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  resultHeroEyebrowDiseased: { color: COLORS.amber },
  resultHeroTitle: {
    color: COLORS.ink,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "800",
    marginTop: 4,
  },
  resultHeroPlant: {
    color: COLORS.deepGreen,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 5,
  },
  resultHeroDescription: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  scanResultSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 15,
    marginTop: 15,
  },
  scanResultSectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  scanResultSectionBody: { color: COLORS.muted, fontSize: 15, lineHeight: 23, marginTop: 8 },
  disclaimer: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 20 },
  scanAgainButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 15,
    borderRadius: 13,
    backgroundColor: COLORS.green,
  },
  scanAgainText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  scannerIntro: { alignItems: "center", paddingTop: 23, paddingBottom: 21 },
  scanIconRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.paleGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  scannerTitle: { color: COLORS.ink, fontWeight: "800", fontSize: 23 },
  scannerDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
    maxWidth: 330,
  },
  pickerRow: { flexDirection: "row", gap: 11 },
  pickerButton: {
    flex: 1,
    minHeight: 113,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
  },
  pickerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.paleGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  pickerTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "800" },
  pickerCaption: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  previewCard: {
    marginTop: 15,
    padding: 8,
    backgroundColor: COLORS.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewFrame: {
    height: 205,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#DCE9DB",
  },
  previewImage: {
    width: "100%",
    height: 205,
    backgroundColor: "#DCE9DB",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "rgba(14, 46, 28, 0.18)",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#76F0A5",
    shadowColor: "#76F0A5",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 5,
  },
  scanBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(21, 92, 55, 0.92)",
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  scanBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  previewCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 5,
    paddingTop: 9,
    paddingBottom: 2,
  },
  previewCaptionText: { color: COLORS.deepGreen, fontSize: 11, fontWeight: "700" },
  uploadHint: {
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.paleGreen,
  },
  uploadHintText: { flex: 1, color: COLORS.deepGreen, fontSize: 11, lineHeight: 16 },
  analyzeButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: COLORS.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 15,
  },
  analyzeButtonDisabled: { opacity: 0.48 },
  analyzeButtonText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  resultCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    padding: 15,
    marginTop: 19,
  },
  resultStatus: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 13 },
  resultHealthy: { backgroundColor: COLORS.paleGreen },
  resultDiseased: { backgroundColor: "#FFF2DF" },
  resultStatusCopy: { flex: 1 },
  resultStatusTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  resultPlant: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  confidenceText: { color: COLORS.green, fontSize: 11, fontWeight: "700", marginTop: 12 },
  severityText: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  healthyMessage: { color: COLORS.deepGreen, fontSize: 12, lineHeight: 18, marginTop: 12 },
  resultSection: { marginTop: 14 },
  resultSectionTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  resultBody: { color: COLORS.muted, fontSize: 11, lineHeight: 17, flex: 1 },
  resultBulletRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.green, marginTop: 6 },
});
