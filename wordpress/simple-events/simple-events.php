<?php
/**
 * Plugin Name: Simple Events
 * Description: A lightweight events manager — add events via the admin, display them on your site.
 * Version: 1.1.2
 * Author: Scott Martin / Knife and Knead
 * Text Domain: simple-events
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'SE_VERSION',    '1.1.2' );
define( 'SE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/* ─────────────────────────────────────────
   AUTO-UPDATES via Plugin Update Checker
   Points to GitHub releases on the knk repo
───────────────────────────────────────── */
require_once SE_PLUGIN_DIR . 'plugin-update-checker/plugin-update-checker.php';
$seUpdateChecker = YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
    'https://github.com/smartin73/knk',
    __FILE__,
    'simple-events'
);
if ( defined( 'SE_GITHUB_TOKEN' ) && SE_GITHUB_TOKEN ) {
    $seUpdateChecker->setAuthentication( SE_GITHUB_TOKEN );
}
$seUpdateChecker->getVcsApi()->enableReleaseAssets();

/* ─────────────────────────────────────────
   1. ACTIVATION — create custom table
───────────────────────────────────────── */
register_activation_hook( __FILE__, 'se_activate' );
function se_activate() {
    global $wpdb;
    $table   = $wpdb->prefix . 'simple_events';
    $charset = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE IF NOT EXISTS $table (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        title       VARCHAR(255)    NOT NULL,
        description LONGTEXT,
        event_date  DATE,
        event_time  TIME,
        end_time    TIME,
        location    VARCHAR(255),
        map_embed   TEXT,
        image_url   VARCHAR(500),
        ticket_url  VARCHAR(500),
        category    VARCHAR(100),
        tags        VARCHAR(255),
        price       VARCHAR(50),
        created_at  DATETIME        DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    ) $charset;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );
    update_option( 'se_db_version', SE_VERSION );
}

/* ─────────────────────────────────────────
   1b. DB UPGRADE — add columns to existing installs
───────────────────────────────────────── */
add_action( 'plugins_loaded', 'se_maybe_upgrade_db' );
function se_maybe_upgrade_db() {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $cols  = $wpdb->get_col( "DESCRIBE $table", 0 );
    if ( ! in_array( 'end_time', $cols ) ) {
        $wpdb->query( "ALTER TABLE $table ADD COLUMN end_time TIME DEFAULT NULL AFTER event_time" );
    }
    if ( ! in_array( 'map_embed', $cols ) ) {
        $wpdb->query( "ALTER TABLE $table ADD COLUMN map_embed TEXT DEFAULT NULL AFTER location" );
    }
}

/* ─────────────────────────────────────────
   2. ADMIN MENU
───────────────────────────────────────── */
add_action( 'admin_menu', 'se_admin_menu' );
function se_admin_menu() {
    add_menu_page(
        'Simple Events',
        'Events',
        'manage_options',
        'simple-events',
        'se_admin_list_page',
        'dashicons-calendar-alt',
        25
    );
    add_submenu_page(
        'simple-events',
        'All Events',
        'All Events',
        'manage_options',
        'simple-events',
        'se_admin_list_page'
    );
    add_submenu_page(
        'simple-events',
        'Add Event',
        'Add Event',
        'manage_options',
        'simple-events-add',
        'se_admin_form_page'
    );
    add_submenu_page(
        'simple-events',
        'API Settings',
        'API Settings',
        'manage_options',
        'simple-events-api',
        'se_admin_api_page'
    );
}

/* ─────────────────────────────────────────
   3. ADMIN STYLES
───────────────────────────────────────── */
add_action( 'admin_head', 'se_admin_styles' );
function se_admin_styles() {
    $screen = get_current_screen();
    if ( ! $screen || strpos( $screen->id, 'simple-events' ) === false ) return;
    ?>
    <style>
        /* ── Layout ── */
        .se-wrap { max-width: 900px; }
        .se-wrap h1 { display:flex; align-items:center; gap:10px; }

        /* ── Form ── */
        .se-form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
        }
        .se-form-grid .se-full { grid-column: 1 / -1; }
        .se-field { display:flex; flex-direction:column; gap:6px; }
        .se-field label { font-weight:600; font-size:13px; color:#1d2327; }
        .se-field input,
        .se-field textarea,
        .se-field select {
            border: 1px solid #8c8f94;
            border-radius: 4px;
            padding: 8px 10px;
            font-size: 14px;
            width: 100%;
            box-sizing: border-box;
        }
        .se-field textarea { min-height: 120px; resize: vertical; }
        .se-field input:focus,
        .se-field textarea:focus,
        .se-field select:focus {
            border-color: #2271b1;
            box-shadow: 0 0 0 1px #2271b1;
            outline: none;
        }
        .se-card {
            background: #fff;
            border: 1px solid #c3c4c7;
            border-radius: 4px;
            padding: 24px;
            margin-top: 20px;
        }
        .se-card h2 { margin-top:0; font-size:16px; border-bottom:1px solid #f0f0f1; padding-bottom:12px; }
        .se-actions { margin-top:24px; display:flex; gap:10px; align-items:center; }

        /* ── Image preview ── */
        #se-image-preview { margin-top:8px; }
        #se-image-preview img { max-width:200px; border-radius:4px; border:1px solid #ddd; }

        /* ── List table ── */
        .se-list-table { width:100%; border-collapse:collapse; margin-top:16px; }
        .se-list-table th {
            text-align:left; padding:10px 12px;
            background:#f6f7f7; border-bottom:2px solid #e2e4e7;
            font-size:13px;
        }
        .se-list-table td {
            padding:10px 12px; border-bottom:1px solid #f0f0f1;
            font-size:13px; vertical-align:middle;
        }
        .se-list-table tr:hover td { background:#f9f9f9; }
        .se-list-table .se-actions-col { white-space:nowrap; }
        .se-badge {
            display:inline-block; padding:2px 8px; border-radius:20px;
            font-size:11px; font-weight:600; background:#e7f3fe; color:#2271b1;
        }
        .se-empty { text-align:center; padding:40px; color:#777; }
        .se-search-bar { display:flex; gap:8px; margin-bottom:16px; }
        .se-search-bar input { width:260px; }

        /* ── Notices ── */
        .se-notice { padding:10px 16px; border-radius:4px; margin-bottom:16px; font-size:13px; }
        .se-notice.success { background:#edfaef; border-left:4px solid #00a32a; color:#1a6b2a; }
        .se-notice.error   { background:#fde8e8; border-left:4px solid #d63638; color:#8a1f1f; }
    </style>
    <?php
}

/* ─────────────────────────────────────────
   4. ADMIN — LIST PAGE
───────────────────────────────────────── */
function se_admin_list_page() {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';

    // Handle delete
    if ( isset( $_GET['action'], $_GET['event_id'] ) && $_GET['action'] === 'delete' ) {
        check_admin_referer( 'se_delete_' . intval( $_GET['event_id'] ) );
        $wpdb->delete( $table, [ 'id' => intval( $_GET['event_id'] ) ] );
        echo '<div class="se-notice success">Event deleted.</div>';
    }

    // Search
    $search = isset( $_GET['s'] ) ? sanitize_text_field( $_GET['s'] ) : '';
    if ( $search ) {
        $like   = '%' . $wpdb->esc_like( $search ) . '%';
        $events = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM $table WHERE title LIKE %s OR location LIKE %s OR category LIKE %s ORDER BY event_date ASC",
            $like, $like, $like
        ) );
    } else {
        $events = $wpdb->get_results( "SELECT * FROM $table ORDER BY event_date ASC" );
    }
    ?>
    <div class="wrap se-wrap">
        <h1>
            <span class="dashicons dashicons-calendar-alt" style="font-size:28px;width:28px;height:28px;"></span>
            Events
            <a href="<?php echo admin_url( 'admin.php?page=simple-events-add' ); ?>" class="page-title-action">Add New</a>
        </h1>

        <form method="get" class="se-search-bar">
            <input type="hidden" name="page" value="simple-events">
            <input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="Search events…">
            <button type="submit" class="button">Search</button>
            <?php if ( $search ) : ?>
                <a href="<?php echo admin_url( 'admin.php?page=simple-events' ); ?>" class="button">Clear</a>
            <?php endif; ?>
        </form>

        <?php if ( empty( $events ) ) : ?>
            <p class="se-empty">No events found. <a href="<?php echo admin_url( 'admin.php?page=simple-events-add' ); ?>">Add your first event →</a></p>
        <?php else : ?>
            <table class="se-list-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $events as $e ) : ?>
                    <tr>
                        <td><strong><?php echo esc_html( $e->title ); ?></strong></td>
                        <td>
                            <?php
                            if ( $e->event_date ) {
                                echo esc_html( date( 'M j, Y', strtotime( $e->event_date ) ) );
                                if ( $e->event_time ) echo ' &middot; ' . esc_html( date( 'g:i A', strtotime( $e->event_time ) ) );
                            }
                            ?>
                        </td>
                        <td><?php echo esc_html( $e->location ); ?></td>
                        <td><?php if ( $e->category ) echo '<span class="se-badge">' . esc_html( $e->category ) . '</span>'; ?></td>
                        <td><?php echo esc_html( $e->price ); ?></td>
                        <td class="se-actions-col">
                            <a href="<?php echo admin_url( 'admin.php?page=simple-events-add&event_id=' . $e->id ); ?>">Edit</a>
                            &nbsp;|&nbsp;
                            <a href="<?php echo wp_nonce_url( admin_url( 'admin.php?page=simple-events&action=delete&event_id=' . $e->id ), 'se_delete_' . $e->id ); ?>"
                               onclick="return confirm('Delete this event?')"
                               style="color:#d63638;">Delete</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
    <?php
}

/* ─────────────────────────────────────────
   5. ADMIN — ADD / EDIT FORM
───────────────────────────────────────── */
function se_admin_form_page() {
    global $wpdb;
    $table    = $wpdb->prefix . 'simple_events';
    $event_id = isset( $_GET['event_id'] ) ? intval( $_GET['event_id'] ) : 0;
    $event    = $event_id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $event_id ) ) : null;
    $notice   = '';

    // Save
    if ( $_SERVER['REQUEST_METHOD'] === 'POST' && isset( $_POST['se_nonce'] ) ) {
        if ( ! wp_verify_nonce( $_POST['se_nonce'], 'se_save_event' ) ) {
            wp_die( 'Security check failed.' );
        }

        $data = [
            'title'       => sanitize_text_field( $_POST['title'] ?? '' ),
            'description' => wp_kses_post( $_POST['description'] ?? '' ),
            'event_date'  => sanitize_text_field( $_POST['event_date'] ?? '' ),
            'event_time'  => sanitize_text_field( $_POST['event_time'] ?? '' ),
            'location'    => sanitize_text_field( $_POST['location'] ?? '' ),
            'image_url'   => esc_url_raw( $_POST['image_url'] ?? '' ),
            'ticket_url'  => esc_url_raw( $_POST['ticket_url'] ?? '' ),
            'category'    => sanitize_text_field( $_POST['category'] ?? '' ),
            'tags'        => sanitize_text_field( $_POST['tags'] ?? '' ),
            'price'       => sanitize_text_field( $_POST['price'] ?? '' ),
        ];

        if ( empty( $data['title'] ) ) {
            $notice = '<div class="se-notice error">Title is required.</div>';
        } else {
            if ( $event_id ) {
                $wpdb->update( $table, $data, [ 'id' => $event_id ] );
                $notice = '<div class="se-notice success">Event updated successfully.</div>';
                $event  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $event_id ) );
            } else {
                $wpdb->insert( $table, $data );
                $event_id = $wpdb->insert_id;
                $event    = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $event_id ) );
                $notice   = '<div class="se-notice success">Event created! <a href="' . admin_url( 'admin.php?page=simple-events' ) . '">← Back to all events</a></div>';
            }
        }
    }

    $v = function( $field ) use ( $event ) {
        return $event ? esc_attr( $event->$field ) : '';
    };
    ?>
    <div class="wrap se-wrap">
        <h1>
            <span class="dashicons dashicons-calendar-alt" style="font-size:28px;width:28px;height:28px;"></span>
            <?php echo $event_id ? 'Edit Event' : 'Add New Event'; ?>
        </h1>
        <p><a href="<?php echo admin_url( 'admin.php?page=simple-events' ); ?>">← Back to all events</a></p>

        <?php echo $notice; ?>

        <form method="post">
            <?php wp_nonce_field( 'se_save_event', 'se_nonce' ); ?>

            <div class="se-card">
                <h2>Event Details</h2>
                <div class="se-form-grid">

                    <div class="se-field se-full">
                        <label for="title">Title <span style="color:#d63638">*</span></label>
                        <input type="text" id="title" name="title" value="<?php echo $v('title'); ?>" required>
                    </div>

                    <div class="se-field se-full">
                        <label for="description">Description</label>
                        <textarea id="description" name="description"><?php echo $event ? esc_textarea( $event->description ) : ''; ?></textarea>
                    </div>

                    <div class="se-field">
                        <label for="event_date">Date</label>
                        <input type="date" id="event_date" name="event_date" value="<?php echo $v('event_date'); ?>">
                    </div>

                    <div class="se-field">
                        <label for="event_time">Time</label>
                        <input type="time" id="event_time" name="event_time" value="<?php echo $v('event_time'); ?>">
                    </div>

                    <div class="se-field">
                        <label for="location">Location / Venue</label>
                        <input type="text" id="location" name="location" value="<?php echo $v('location'); ?>">
                    </div>

                    <div class="se-field">
                        <label for="price">Price</label>
                        <input type="text" id="price" name="price" placeholder="e.g. Free, $20, £15" value="<?php echo $v('price'); ?>">
                    </div>

                    <div class="se-field">
                        <label for="category">Category</label>
                        <input type="text" id="category" name="category" value="<?php echo $v('category'); ?>">
                    </div>

                    <div class="se-field">
                        <label for="tags">Tags <span style="font-weight:normal;color:#777">(comma-separated)</span></label>
                        <input type="text" id="tags" name="tags" placeholder="music, outdoor, family" value="<?php echo $v('tags'); ?>">
                    </div>

                    <div class="se-field se-full">
                        <label for="ticket_url">Ticket / Info URL</label>
                        <input type="url" id="ticket_url" name="ticket_url" placeholder="https://…" value="<?php echo $v('ticket_url'); ?>">
                    </div>

                </div>
            </div>

            <div class="se-card">
                <h2>Event Image</h2>
                <div class="se-field">
                    <label for="image_url">Image URL</label>
                    <input type="url" id="image_url" name="image_url" placeholder="https://…" value="<?php echo $v('image_url'); ?>">
                    <div id="se-image-preview">
                        <?php if ( $event && $event->image_url ) : ?>
                            <img src="<?php echo esc_url( $event->image_url ); ?>" alt="Preview">
                        <?php endif; ?>
                    </div>
                    <button type="button" class="button" id="se-media-btn" style="margin-top:8px;">Choose from Media Library</button>
                </div>
            </div>

            <div class="se-actions">
                <button type="submit" class="button button-primary button-large">
                    <?php echo $event_id ? 'Update Event' : 'Save Event'; ?>
                </button>
                <a href="<?php echo admin_url( 'admin.php?page=simple-events' ); ?>" class="button button-large">Cancel</a>
            </div>
        </form>
    </div>

    <script>
    // Live image preview
    document.getElementById('image_url').addEventListener('input', function() {
        var preview = document.getElementById('se-image-preview');
        preview.innerHTML = this.value ? '<img src="' + this.value + '" alt="Preview" onerror="this.style.display=\'none\'">' : '';
    });

    // WP Media Library picker
    document.getElementById('se-media-btn').addEventListener('click', function(e) {
        e.preventDefault();
        var frame = wp.media({
            title: 'Select Event Image',
            button: { text: 'Use this image' },
            multiple: false,
            library: { type: 'image' }
        });
        frame.on('select', function() {
            var attachment = frame.state().get('selection').first().toJSON();
            document.getElementById('image_url').value = attachment.url;
            document.getElementById('se-image-preview').innerHTML = '<img src="' + attachment.url + '" alt="Preview">';
        });
        frame.open();
    });
    </script>
    <?php
}

// Enqueue WP media scripts on our admin pages
add_action( 'admin_enqueue_scripts', function( $hook ) {
    if ( strpos( $hook, 'simple-events' ) !== false ) {
        wp_enqueue_media();
    }
} );

/* ─────────────────────────────────────────
   6. SHORTCODES  [simple_events]  [simple_event_detail]
───────────────────────────────────────── */
add_shortcode( 'simple_events', 'se_shortcode_list' );
function se_shortcode_list( $atts ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';

    $atts = shortcode_atts( [
        'category' => '',
        'limit'    => 50,
    ], $atts );

    // Search handling
    $search = isset( $_GET['se_search'] ) ? sanitize_text_field( $_GET['se_search'] ) : '';
    $cat    = isset( $_GET['se_cat'] )    ? sanitize_text_field( $_GET['se_cat'] )    : $atts['category'];

    $where  = [ '1=1' ];
    $params = [];

    if ( $search ) {
        $where[]  = '(title LIKE %s OR description LIKE %s OR location LIKE %s)';
        $like     = '%' . $wpdb->esc_like( $search ) . '%';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }
    if ( $cat ) {
        $where[]  = 'category = %s';
        $params[] = $cat;
    }

    $sql = "SELECT * FROM $table WHERE " . implode( ' AND ', $where ) . " ORDER BY event_date ASC LIMIT %d";
    $params[] = intval( $atts['limit'] );

    $events = $params
        ? $wpdb->get_results( $wpdb->prepare( $sql, ...$params ) )
        : $wpdb->get_results( $sql );

    // Get all categories for filter
    $cats = $wpdb->get_col( "SELECT DISTINCT category FROM $table WHERE category != '' ORDER BY category ASC" );

    // Detail view?
    if ( isset( $_GET['se_event'] ) ) {
        return se_render_detail( intval( $_GET['se_event'] ) );
    }

    ob_start();
    se_enqueue_frontend_styles();
    ?>
    <div class="se-frontend">

        <div class="se-search-filter">
            <form method="get" class="se-search-form">
                <?php
                // Preserve other query vars
                foreach ( $_GET as $k => $v ) {
                    if ( ! in_array( $k, [ 'se_search', 'se_cat' ] ) ) {
                        echo '<input type="hidden" name="' . esc_attr( $k ) . '" value="' . esc_attr( $v ) . '">';
                    }
                }
                ?>
                <input type="search" name="se_search" value="<?php echo esc_attr( $search ); ?>" placeholder="Search events…" class="se-input">

                <?php if ( $cats ) : ?>
                <select name="se_cat" class="se-input">
                    <option value="">All categories</option>
                    <?php foreach ( $cats as $c ) : ?>
                        <option value="<?php echo esc_attr( $c ); ?>" <?php selected( $cat, $c ); ?>><?php echo esc_html( $c ); ?></option>
                    <?php endforeach; ?>
                </select>
                <?php endif; ?>

                <button type="submit" class="se-btn">Search</button>
                <?php if ( $search || $cat ) : ?>
                    <a href="?" class="se-btn se-btn-outline">Clear</a>
                <?php endif; ?>
            </form>
        </div>

        <?php if ( empty( $events ) ) : ?>
            <p class="se-empty-msg">No events found.</p>
        <?php else : ?>
            <div class="se-list">
                <?php foreach ( $events as $e ) :
                    $detail_url = add_query_arg( 'se_event', $e->id );
                ?>
                <article class="se-event-card">
                    <?php if ( $e->event_date ) :
                        $ts = strtotime( $e->event_date );
                    ?>
                    <div class="se-card-date-badge">
                        <div class="se-badge-month"><?php echo esc_html( date( 'M', $ts ) ); ?></div>
                        <div class="se-badge-day"><?php echo esc_html( date( 'j', $ts ) ); ?></div>
                        <div class="se-badge-dow"><?php echo esc_html( date( 'D', $ts ) ); ?></div>
                    </div>
                    <?php endif; ?>

                    <?php if ( $e->image_url ) : ?>
                        <a href="<?php echo esc_url( $detail_url ); ?>" class="se-card-image">
                            <img src="<?php echo esc_url( $e->image_url ); ?>" alt="<?php echo esc_attr( $e->title ); ?>">
                        </a>
                    <?php endif; ?>

                    <div class="se-card-body">
                        <?php if ( $e->category ) : ?>
                            <span class="se-tag"><?php echo esc_html( $e->category ); ?></span>
                        <?php endif; ?>
                        <h2 class="se-card-title">
                            <a href="<?php echo esc_url( $detail_url ); ?>"><?php echo esc_html( $e->title ); ?></a>
                        </h2>
                        <div class="se-card-meta">
                            <?php if ( $e->event_time ) : ?>
                                <span class="se-meta-item">
                                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
                                    <?php
                                    echo esc_html( date( 'g:i A', strtotime( $e->event_time ) ) );
                                    if ( ! empty( $e->end_time ) ) {
                                        echo ' &ndash; ' . esc_html( date( 'g:i A', strtotime( $e->end_time ) ) );
                                    }
                                    ?>
                                </span>
                            <?php endif; ?>
                            <?php if ( $e->location ) : ?>
                                <span class="se-meta-item">
                                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                                    <?php echo esc_html( $e->location ); ?>
                                </span>
                            <?php endif; ?>
                            <?php if ( $e->price ) : ?>
                                <span class="se-meta-item">
                                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>
                                    <?php echo esc_html( $e->price ); ?>
                                </span>
                            <?php endif; ?>
                        </div>
                        <?php if ( $e->ticket_url ) : ?>
                            <a href="<?php echo esc_url( $e->ticket_url ); ?>" class="se-btn se-btn-sm" target="_blank" rel="noopener">Tickets / More Info</a>
                        <?php endif; ?>
                    </div>
                </article>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
    <?php
    return ob_get_clean();
}

/* ─────────────────────────────────────────
   7. DETAIL VIEW (rendered inside list page)
───────────────────────────────────────── */
function se_render_detail( $id ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $e     = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ) );

    if ( ! $e ) return '<p>Event not found.</p>';

    ob_start();
    se_enqueue_frontend_styles();
    ?>
    <div class="se-frontend se-detail">
        <a href="?" class="se-back-link">← Back to all events</a>

        <div class="se-detail-card">

            <!-- Header: Name + Category -->
            <div class="se-detail-header">
                <div>
                    <h1 class="se-detail-title"><?php echo esc_html( $e->title ); ?></h1>
                    <?php if ( $e->category ) : ?>
                        <div class="se-detail-category"><?php echo esc_html( $e->category ); ?></div>
                    <?php endif; ?>
                </div>
            </div>

            <?php if ( $e->image_url ) : ?>
                <img src="<?php echo esc_url( $e->image_url ); ?>" alt="<?php echo esc_attr( $e->title ); ?>" class="se-detail-image">
            <?php endif; ?>

            <!-- 2-column metadata grid (mirrors KNK EventDetail) -->
            <div class="se-detail-grid">
                <?php if ( $e->event_date ) : ?>
                <div class="se-detail-field">
                    <div class="se-field-label">Date</div>
                    <div class="se-field-value"><?php echo esc_html( date( 'l, F j, Y', strtotime( $e->event_date ) ) ); ?></div>
                </div>
                <?php endif; ?>

                <?php if ( $e->event_time ) : ?>
                <div class="se-detail-field">
                    <div class="se-field-label">Time</div>
                    <div class="se-field-value"><?php
                        echo esc_html( date( 'g:i A', strtotime( $e->event_time ) ) );
                        if ( ! empty( $e->end_time ) ) {
                            echo ' &ndash; ' . esc_html( date( 'g:i A', strtotime( $e->end_time ) ) );
                        }
                    ?></div>
                </div>
                <?php endif; ?>

                <?php if ( $e->location ) : ?>
                <div class="se-detail-field">
                    <div class="se-field-label">Location</div>
                    <div class="se-field-value"><?php echo esc_html( $e->location ); ?></div>
                </div>
                <?php endif; ?>

                <?php if ( $e->price ) : ?>
                <div class="se-detail-field">
                    <div class="se-field-label">Price</div>
                    <div class="se-field-value"><?php echo esc_html( $e->price ); ?></div>
                </div>
                <?php endif; ?>

                <?php if ( $e->ticket_url ) : ?>
                <div class="se-detail-field">
                    <div class="se-field-label">Tickets</div>
                    <div class="se-field-value">
                        <a href="<?php echo esc_url( $e->ticket_url ); ?>" target="_blank" rel="noopener" class="se-field-link">Get Tickets / More Info →</a>
                    </div>
                </div>
                <?php endif; ?>
            </div>

            <?php if ( $e->description ) : ?>
            <div class="se-detail-section">
                <div class="se-field-label">Description</div>
                <div class="se-detail-description"><?php echo wp_kses_post( nl2br( $e->description ) ); ?></div>
            </div>
            <?php endif; ?>

            <?php if ( ! empty( $e->map_embed ) ) : ?>
            <div class="se-detail-section">
                <div class="se-field-label">Map</div>
                <div class="se-detail-map"><?php echo wp_kses( $e->map_embed, [
                    'iframe' => [
                        'src'             => true, 'width'           => true, 'height'          => true,
                        'style'           => true, 'allowfullscreen' => true, 'loading'         => true,
                        'referrerpolicy'  => true, 'frameborder'     => true,
                    ],
                ] ); ?></div>
            </div>
            <?php endif; ?>

            <?php if ( $e->tags ) : ?>
            <div class="se-detail-tags">
                <?php foreach ( array_map( 'trim', explode( ',', $e->tags ) ) as $tag ) : ?>
                    <span class="se-tag se-tag-sm"><?php echo esc_html( $tag ); ?></span>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>

        </div><!-- .se-detail-card -->
    </div>
    <?php
    return ob_get_clean();
}

/* ─────────────────────────────────────────
   8. FRONTEND STYLES
───────────────────────────────────────── */
function se_enqueue_frontend_styles() {
    static $done = false;
    if ( $done ) return;
    $done = true;
    ?>
    <style>
    .se-frontend { font-family: inherit; color: inherit; }

    /* ── Search / Filter ── */
    .se-search-form { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:28px; align-items:center; }
    .se-input {
        padding: 9px 14px; border: 1px solid #d1d5db; border-radius: 8px;
        font-size: 14px; background: #fff; color: inherit; line-height: 1.4;
        transition: border-color .15s, box-shadow .15s;
    }
    .se-input:focus { outline:none; border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,.12); }

    /* ── Buttons ── */
    .se-btn {
        display:inline-block; padding:9px 20px; background:#7c3aed; color:#fff !important;
        border:none; border-radius:8px; font-size:14px; font-weight:600;
        cursor:pointer; text-decoration:none !important; transition: background .15s, transform .1s;
        line-height: 1.4;
    }
    .se-btn:hover { background:#6d28d9; transform: translateY(-1px); }
    .se-btn-primary { background:#7c3aed; }
    .se-btn-primary:hover { background:#6d28d9; }
    .se-btn-outline { background:transparent !important; color:#6b7280 !important; border:1px solid #d1d5db; }
    .se-btn-outline:hover { border-color:#7c3aed; color:#7c3aed !important; background:transparent !important; transform:none; }
    .se-btn-sm { padding:7px 16px; font-size:13px; }

    /* ── Category pill ── */
    .se-tag {
        display:inline-block; padding:3px 12px; border-radius:20px;
        font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase;
        background:#f3f0ff; color:#7c3aed; margin-bottom:10px;
    }
    .se-tag-sm { font-size:10px; padding:2px 9px; }

    /* ── Event list ── */
    .se-list { display:flex; flex-direction:column; gap:0; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
    .se-event-card {
        display:flex; gap:0; background:#fff;
        border-bottom:1px solid #e5e7eb;
        transition: background .15s;
    }
    .se-event-card:last-child { border-bottom:none; }
    .se-event-card:hover { background:#faf9ff; }

    /* Date badge on the left */
    .se-card-date-badge {
        flex: 0 0 80px; display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding: 20px 8px; background:#f3f0ff; border-right:1px solid #e5e7eb;
        text-align:center; line-height:1.2;
    }
    .se-card-date-badge .se-badge-month { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#7c3aed; }
    .se-card-date-badge .se-badge-day   { font-size:30px; font-weight:800; color:#1f2937; line-height:1; margin: 3px 0; }
    .se-card-date-badge .se-badge-dow   { font-size:11px; color:#9ca3af; font-weight:500; }

    .se-card-image { flex:0 0 200px; overflow:hidden; }
    .se-card-image img { width:100%; height:100%; object-fit:cover; display:block; transition: transform .3s; }
    .se-event-card:hover .se-card-image img { transform:scale(1.03); }

    .se-card-body { flex:1; padding:20px 24px; display:flex; flex-direction:column; justify-content:center; }
    .se-card-title { margin:0 0 8px; font-size:18px; font-weight:700; line-height:1.3; }
    .se-card-title a { color:inherit; text-decoration:none; }
    .se-card-title a:hover { color:#7c3aed; }

    .se-card-meta { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:12px; }
    .se-meta-item { display:flex; align-items:center; gap:5px; font-size:13px; color:#6b7280; }
    .se-meta-item svg { width:14px; height:14px; flex-shrink:0; color:#9ca3af; }

    .se-empty-msg { color:#9ca3af; padding:48px 0; text-align:center; font-size:15px; }

    /* ── Detail view ── */
    .se-back-link { display:inline-flex; align-items:center; gap:5px; font-size:14px; color:#6b7280; text-decoration:none; margin-bottom:20px; }
    .se-back-link:hover { color:#7c3aed; }

    .se-detail-card {
        background:#fff; border:1px solid #e5e7eb; border-radius:12px;
        padding:28px 32px; box-shadow:0 1px 4px rgba(0,0,0,.06);
    }

    .se-detail-header { margin-bottom:20px; }
    .se-detail-title { font-size:22px; font-weight:700; line-height:1.3; margin:0 0 4px; color:#111827; }
    .se-detail-category { font-size:13px; color:#6b7280; margin-top:2px; }

    .se-detail-image {
        width:100%; max-height:360px; object-fit:cover;
        border-radius:8px; margin-bottom:24px; display:block;
    }

    /* 2-column grid — mirrors KNK EventDetail */
    .se-detail-grid {
        display:grid; grid-template-columns:1fr 1fr; gap:14px 24px; margin-bottom:24px;
    }
    .se-detail-field {}
    .se-field-label {
        font-size:11px; font-weight:600; color:#9ca3af;
        text-transform:uppercase; letter-spacing:.4px; margin-bottom:3px;
    }
    .se-field-value { font-size:13px; color:#111827; }
    .se-field-link { color:#7c3aed; text-decoration:none; font-size:13px; }
    .se-field-link:hover { text-decoration:underline; }

    .se-detail-section { margin-bottom:20px; }
    .se-detail-description { font-size:13px; line-height:1.7; color:#374151; margin-top:6px; }

    .se-detail-map { margin-top:8px; border-radius:8px; overflow:hidden; }
    .se-detail-map iframe { display:block; width:100%; border:0; }

    .se-detail-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:20px; }

    @media (max-width: 640px) {
        .se-event-card { flex-direction:column; }
        .se-card-date-badge { flex-direction:row; gap:10px; padding:14px 16px; border-right:none; border-bottom:1px solid #e5e7eb; justify-content:flex-start; }
        .se-card-date-badge .se-badge-day { font-size:22px; }
        .se-card-image { height:180px; }
        .se-detail-card { padding:20px 16px; }
        .se-detail-title { font-size:20px; }
        .se-detail-grid { grid-template-columns:1fr; gap:12px; }
    }
    </style>
    <?php
}

/* ═════════════════════════════════════════════════════════════
   9. REST API  —  /wp-json/simple-events/v1/
═════════════════════════════════════════════════════════════ */

add_action( 'rest_api_init', 'se_register_rest_routes' );
function se_register_rest_routes() {
    $ns = 'simple-events/v1';

    // GET  /events          — list (public, filtered by API key if set)
    // POST /events          — create (requires API key)
    register_rest_route( $ns, '/events', [
        [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'se_api_get_events',
            'permission_callback' => 'se_api_public_permission',
            'args'                => se_api_list_args(),
        ],
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'se_api_create_event',
            'permission_callback' => 'se_api_key_permission',
            'args'                => se_api_event_args(),
        ],
    ] );

    // GET    /events/<id>   — single event (public)
    // PUT    /events/<id>   — update (requires API key)
    // DELETE /events/<id>   — delete (requires API key)
    register_rest_route( $ns, '/events/(?P<id>\d+)', [
        [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'se_api_get_event',
            'permission_callback' => 'se_api_public_permission',
            'args'                => [ 'id' => [ 'validate_callback' => fn($v) => is_numeric($v) ] ],
        ],
        [
            'methods'             => WP_REST_Server::EDITABLE,
            'callback'            => 'se_api_update_event',
            'permission_callback' => 'se_api_key_permission',
            'args'                => se_api_event_args( false ),
        ],
        [
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => 'se_api_delete_event',
            'permission_callback' => 'se_api_key_permission',
        ],
    ] );

    // GET /categories  — list distinct categories (public)
    register_rest_route( $ns, '/categories', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'se_api_get_categories',
        'permission_callback' => 'se_api_public_permission',
    ] );
}

/* ── Permission callbacks ── */

function se_api_public_permission() {
    // If no API key is configured, endpoints are fully public.
    // If a key IS configured, read endpoints still allow public access
    // (write endpoints always require the key).
    return true;
}

function se_api_key_permission( WP_REST_Request $request ) {
    $stored_key = get_option( 'se_api_key', '' );

    // No key set → only WP admins can write
    if ( empty( $stored_key ) ) {
        return current_user_can( 'manage_options' );
    }

    $provided = $request->get_header( 'X-SE-API-Key' );
    if ( ! $provided ) {
        // Also accept as query param for easy testing
        $provided = $request->get_param( 'api_key' );
    }

    return hash_equals( $stored_key, (string) $provided );
}

/* ── Helpers ── */

function se_format_event( $e ) {
    return [
        'id'          => (int) $e->id,
        'title'       => $e->title,
        'description' => $e->description,
        'event_date'  => $e->event_date,
        'event_time'  => $e->event_time,
        'end_time'    => $e->end_time ?? null,
        'location'    => $e->location,
        'map_embed'   => $e->map_embed ?? null,
        'image_url'   => $e->image_url,
        'ticket_url'  => $e->ticket_url,
        'category'    => $e->category,
        'tags'        => $e->tags ? array_map( 'trim', explode( ',', $e->tags ) ) : [],
        'price'       => $e->price,
        'created_at'  => $e->created_at,
        'updated_at'  => $e->updated_at,
    ];
}

function se_api_list_args() {
    return [
        'search'   => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ],
        'category' => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ],
        'limit'    => [ 'type' => 'integer', 'default' => 100, 'minimum' => 1, 'maximum' => 500 ],
        'offset'   => [ 'type' => 'integer', 'default' => 0,   'minimum' => 0 ],
        'from'     => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ], // date YYYY-MM-DD
        'to'       => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ],
    ];
}

function se_api_event_args( $required = true ) {
    $r = $required ? [ 'required' => true ] : [];
    return [
        'title'       => $r + [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'description' => [ 'type' => 'string', 'sanitize_callback' => 'wp_kses_post' ],
        'event_date'  => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'event_time'  => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'end_time'    => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'location'    => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'map_embed'   => [ 'type' => 'string', 'sanitize_callback' => 'wp_kses_post' ],
        'image_url'   => [ 'type' => 'string', 'sanitize_callback' => 'esc_url_raw' ],
        'ticket_url'  => [ 'type' => 'string', 'sanitize_callback' => 'esc_url_raw' ],
        'category'    => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'tags'        => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
        'price'       => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
    ];
}

/* ── Route handlers ── */

function se_api_get_events( WP_REST_Request $request ) {
    global $wpdb;
    $table  = $wpdb->prefix . 'simple_events';
    $where  = [ '1=1' ];
    $params = [];

    if ( $s = $request->get_param( 'search' ) ) {
        $like     = '%' . $wpdb->esc_like( $s ) . '%';
        $where[]  = '(title LIKE %s OR description LIKE %s OR location LIKE %s OR tags LIKE %s)';
        $params[] = $like; $params[] = $like; $params[] = $like; $params[] = $like;
    }
    if ( $cat = $request->get_param( 'category' ) ) {
        $where[] = 'category = %s'; $params[] = $cat;
    }
    if ( $from = $request->get_param( 'from' ) ) {
        $where[] = 'event_date >= %s'; $params[] = $from;
    }
    if ( $to = $request->get_param( 'to' ) ) {
        $where[] = 'event_date <= %s'; $params[] = $to;
    }

    $limit  = intval( $request->get_param( 'limit' ) );
    $offset = intval( $request->get_param( 'offset' ) );
    $params[] = $limit;
    $params[] = $offset;

    $sql    = "SELECT * FROM $table WHERE " . implode( ' AND ', $where ) . " ORDER BY event_date ASC LIMIT %d OFFSET %d";
    $events = $wpdb->get_results( $wpdb->prepare( $sql, ...$params ) );

    // Total count for pagination headers
    $count_sql   = "SELECT COUNT(*) FROM $table WHERE " . implode( ' AND ', $where );
    $count_params = array_slice( $params, 0, -2 );
    $total       = $count_params
        ? (int) $wpdb->get_var( $wpdb->prepare( $count_sql, ...$count_params ) )
        : (int) $wpdb->get_var( $count_sql );

    $response = new WP_REST_Response( array_map( 'se_format_event', $events ), 200 );
    $response->header( 'X-SE-Total',  $total );
    $response->header( 'X-SE-Limit',  $limit );
    $response->header( 'X-SE-Offset', $offset );
    return $response;
}

function se_api_get_event( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $e     = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $request['id'] ) );
    if ( ! $e ) return new WP_Error( 'not_found', 'Event not found.', [ 'status' => 404 ] );
    return rest_ensure_response( se_format_event( $e ) );
}

function se_api_create_event( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $data  = [
        'title'       => $request->get_param( 'title' ),
        'description' => $request->get_param( 'description' ) ?? '',
        'event_date'  => $request->get_param( 'event_date' )  ?? null,
        'event_time'  => $request->get_param( 'event_time' )  ?? null,
        'end_time'    => $request->get_param( 'end_time' )    ?? null,
        'location'    => $request->get_param( 'location' )    ?? '',
        'map_embed'   => $request->get_param( 'map_embed' )   ?? '',
        'image_url'   => $request->get_param( 'image_url' )   ?? '',
        'ticket_url'  => $request->get_param( 'ticket_url' )  ?? '',
        'category'    => $request->get_param( 'category' )    ?? '',
        'tags'        => $request->get_param( 'tags' )        ?? '',
        'price'       => $request->get_param( 'price' )       ?? '',
    ];
    $wpdb->insert( $table, $data );
    if ( ! $wpdb->insert_id ) return new WP_Error( 'db_error', 'Could not create event.', [ 'status' => 500 ] );
    $e = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $wpdb->insert_id ) );
    return new WP_REST_Response( se_format_event( $e ), 201 );
}

function se_api_update_event( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $id    = intval( $request['id'] );
    if ( ! $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $table WHERE id = %d", $id ) ) ) {
        return new WP_Error( 'not_found', 'Event not found.', [ 'status' => 404 ] );
    }
    $fields = [ 'title','description','event_date','event_time','end_time','location','map_embed','image_url','ticket_url','category','tags','price' ];
    $data   = [];
    foreach ( $fields as $f ) {
        if ( $request->has_param( $f ) ) $data[ $f ] = $request->get_param( $f );
    }
    if ( $data ) $wpdb->update( $table, $data, [ 'id' => $id ] );
    $e = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ) );
    return rest_ensure_response( se_format_event( $e ) );
}

function se_api_delete_event( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $id    = intval( $request['id'] );
    $e     = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ) );
    if ( ! $e ) return new WP_Error( 'not_found', 'Event not found.', [ 'status' => 404 ] );
    $wpdb->delete( $table, [ 'id' => $id ] );
    return rest_ensure_response( [ 'deleted' => true, 'id' => $id ] );
}

function se_api_get_categories( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'simple_events';
    $cats  = $wpdb->get_col( "SELECT DISTINCT category FROM $table WHERE category != '' ORDER BY category ASC" );
    return rest_ensure_response( $cats );
}

/* ═════════════════════════════════════════════════════════════
   10. API SETTINGS PAGE
═════════════════════════════════════════════════════════════ */

function se_admin_api_page() {
    $notice = '';

    if ( isset( $_POST['se_api_nonce'] ) && wp_verify_nonce( $_POST['se_api_nonce'], 'se_save_api_settings' ) ) {
        if ( isset( $_POST['generate_key'] ) ) {
            $new_key = 'se_' . bin2hex( random_bytes( 24 ) );
            update_option( 'se_api_key', $new_key );
            $notice = '<div class="se-notice success">New API key generated.</div>';
        } elseif ( isset( $_POST['revoke_key'] ) ) {
            delete_option( 'se_api_key' );
            $notice = '<div class="se-notice success">API key revoked. Write endpoints now require WordPress admin login.</div>';
        }
    }

    $api_key  = get_option( 'se_api_key', '' );
    $base_url = rest_url( 'simple-events/v1' );
    ?>
    <div class="wrap se-wrap">
        <h1>
            <span class="dashicons dashicons-rest-api" style="font-size:28px;width:28px;height:28px;"></span>
            API Settings
        </h1>
        <?php echo $notice; ?>

        <div class="se-card">
            <h2>API Key</h2>
            <p style="color:#555;font-size:13px;margin-top:0;">
                The API key secures write access (create, update, delete). Read endpoints are always public.
                Pass the key in the <code>X-SE-API-Key</code> request header.
            </p>

            <?php if ( $api_key ) : ?>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                    <input type="text" value="<?php echo esc_attr( $api_key ); ?>" readonly
                           id="se-api-key-field"
                           style="font-family:monospace;font-size:13px;width:420px;background:#f6f7f7;">
                    <button type="button" class="button" onclick="
                        navigator.clipboard.writeText(document.getElementById('se-api-key-field').value);
                        this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)
                    ">Copy</button>
                </div>
                <form method="post" style="display:inline-block;margin-right:8px;">
                    <?php wp_nonce_field( 'se_save_api_settings', 'se_api_nonce' ); ?>
                    <button name="generate_key" class="button">Regenerate Key</button>
                </form>
                <form method="post" style="display:inline-block;">
                    <?php wp_nonce_field( 'se_save_api_settings', 'se_api_nonce' ); ?>
                    <button name="revoke_key" class="button" style="color:#d63638;"
                            onclick="return confirm('Revoke the API key? External apps will lose write access.')">
                        Revoke Key
                    </button>
                </form>
            <?php else : ?>
                <p style="color:#777;font-size:13px;">No API key set. Write endpoints require WordPress admin login.</p>
                <form method="post">
                    <?php wp_nonce_field( 'se_save_api_settings', 'se_api_nonce' ); ?>
                    <button name="generate_key" class="button button-primary">Generate API Key</button>
                </form>
            <?php endif; ?>
        </div>

        <div class="se-card">
            <h2>Endpoints</h2>
            <p style="color:#555;font-size:13px;margin-top:0;">
                Base URL: <code><?php echo esc_html( $base_url ); ?></code>
            </p>
            <table class="se-list-table" style="margin-top:0;">
                <thead>
                    <tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Description</th></tr>
                </thead>
                <tbody>
                    <?php
                    $endpoints = [
                        [ 'GET',    '/events',             'Public',   'List all events. Supports: search, category, from, to, limit, offset' ],
                        [ 'POST',   '/events',             'API Key',  'Create a new event' ],
                        [ 'GET',    '/events/{id}',        'Public',   'Get a single event by ID' ],
                        [ 'PUT',    '/events/{id}',        'API Key',  'Update an existing event' ],
                        [ 'DELETE', '/events/{id}',        'API Key',  'Delete an event' ],
                        [ 'GET',    '/categories',         'Public',   'List all distinct categories' ],
                    ];
                    foreach ( $endpoints as [$method, $path, $auth, $desc] ) :
                        $badge_color = $auth === 'Public' ? '#d1fae5;color:#065f46' : '#fef3c7;color:#92400e';
                    ?>
                    <tr>
                        <td><code><?php echo $method; ?></code></td>
                        <td><code><?php echo esc_html( $base_url . $path ); ?></code></td>
                        <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:<?php echo $badge_color; ?>"><?php echo $auth; ?></span></td>
                        <td style="font-size:12px;color:#555;"><?php echo esc_html( $desc ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <div class="se-card">
            <h2>Example Usage</h2>
            <p style="font-size:13px;color:#555;margin-top:0;">Fetching events from any external app:</p>
            <pre style="background:#1d2327;color:#f0f0f0;padding:16px;border-radius:6px;font-size:12px;overflow-x:auto;"><code><?php
echo esc_html(
"// Fetch all upcoming events
fetch('" . $base_url . "/events?from=" . date('Y-m-d') . "')
  .then(r => r.json())
  .then(events => console.log(events));

// Create an event (requires API key)
fetch('" . $base_url . "/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-SE-API-Key': 'your-api-key-here'
  },
  body: JSON.stringify({
    title: 'Summer Concert',
    event_date: '2025-07-15',
    event_time: '19:00:00',
    location: 'Central Park',
    price: '\$25',
    category: 'Music'
  })
});"
);
            ?></code></pre>
        </div>

    </div>
    <?php
}
