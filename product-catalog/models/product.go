package models

// Product Struct สำหรับแคตตาล็อกสินค้าฮาร์ดแวร์คอมพิวเตอร์
type Product struct {
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Brand    string  `json:"brand"`
	Price    float64 `json:"price"`
	Stock    int     `json:"stock"`
	Specs    string  `json:"specs"`
	ImageURL string  `json:"image_url"`
	Status   string  `json:"status"`
}